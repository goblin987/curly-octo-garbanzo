"""
Telegram Mini App - Flask API Server
Lightweight REST API for the shopping mini app
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3
import hashlib
import hmac
import urllib.parse
import os
import logging
from decimal import Decimal
from datetime import datetime, timezone

# Import from existing modules
from utils import get_db_connection, CITIES, DISTRICTS, PRODUCT_TYPES, load_all_data
from reseller_management import get_reseller_discount
from user import validate_and_apply_discount_atomic

app = Flask(__name__, static_folder='static', static_url_path='')
CORS(app)

# Configuration
BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '')
MEDIA_DIR = os.getenv('MEDIA_DIR', '/mnt/data/media')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load data on startup
load_all_data()


def validate_telegram_webapp_data(init_data: str) -> dict | None:
    """Validate Telegram WebApp initData and extract user info"""
    try:
        parsed_data = dict(urllib.parse.parse_qsl(init_data))
        data_check_string_parts = []
        
        for key in sorted(parsed_data.keys()):
            if key != 'hash':
                data_check_string_parts.append(f"{key}={parsed_data[key]}")
        
        data_check_string = '\n'.join(data_check_string_parts)
        secret_key = hmac.new(
            b"WebAppData",
            BOT_TOKEN.encode(),
            hashlib.sha256
        ).digest()
        
        calculated_hash = hmac.new(
            secret_key,
            data_check_string.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if calculated_hash == parsed_data.get('hash'):
            import json
            user_data = json.loads(parsed_data.get('user', '{}'))
            return user_data
        
        return None
    except Exception as e:
        logger.error(f"Error validating Telegram data: {e}")
        return None


def get_user_from_request():
    """Extract and validate user from request headers"""
    init_data = request.headers.get('X-Telegram-Init-Data', '')
    if not init_data:
        return None
    
    user = validate_telegram_webapp_data(init_data)
    return user


@app.route('/')
def index():
    """Serve the mini app HTML"""
    return send_from_directory('static', 'index.html')


@app.route('/api/cities', methods=['GET'])
def get_cities():
    """Get all available cities"""
    try:
        cities_list = [
            {'id': city_id, 'name': city_name}
            for city_id, city_name in CITIES.items()
        ]
        return jsonify({'success': True, 'cities': cities_list})
    except Exception as e:
        logger.error(f"Error getting cities: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/districts/<city_id>', methods=['GET'])
def get_districts(city_id):
    """Get districts for a city"""
    try:
        districts_dict = DISTRICTS.get(city_id, {})
        districts_list = [
            {'id': dist_id, 'name': dist_name}
            for dist_id, dist_name in districts_dict.items()
        ]
        return jsonify({'success': True, 'districts': districts_list})
    except Exception as e:
        logger.error(f"Error getting districts: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/product-types', methods=['GET'])
def get_product_types():
    """Get all product types with emojis"""
    try:
        types_list = [
            {'name': type_name, 'emoji': emoji}
            for type_name, emoji in PRODUCT_TYPES.items()
        ]
        return jsonify({'success': True, 'types': types_list})
    except Exception as e:
        logger.error(f"Error getting product types: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/products', methods=['GET'])
def get_products():
    """Get products with filters"""
    try:
        city = request.args.get('city')
        district = request.args.get('district')
        product_type = request.args.get('type')
        user_id = request.args.get('user_id', type=int)
        
        conn = get_db_connection()
        c = conn.cursor()
        
        query = """
            SELECT id, city, district, product_type, size, price, 
                   (available - reserved) as in_stock
            FROM products 
            WHERE available > reserved
        """
        params = []
        
        if city:
            query += " AND city = ?"
            params.append(CITIES.get(city, city))
        
        if district and city:
            query += " AND district = ?"
            params.append(DISTRICTS.get(city, {}).get(district, district))
        
        if product_type:
            query += " AND product_type = ?"
            params.append(product_type)
        
        query += " ORDER BY id DESC LIMIT 100"
        
        c.execute(query, params)
        products = []
        
        for row in c.fetchall():
            product = {
                'id': row['id'],
                'city': row['city'],
                'district': row['district'],
                'type': row['product_type'],
                'size': row['size'],
                'price': float(row['price']),
                'in_stock': row['in_stock'],
                'emoji': PRODUCT_TYPES.get(row['product_type'], '📦')
            }
            
            # Calculate reseller discount if user_id provided
            if user_id:
                try:
                    discount_percent = get_reseller_discount(user_id, row['product_type'])
                    if discount_percent > 0:
                        discount_amount = float(row['price']) * discount_percent / 100
                        product['original_price'] = float(row['price'])
                        product['price'] = float(row['price']) - discount_amount
                        product['discount_percent'] = discount_percent
                except Exception as e:
                    logger.error(f"Error calculating reseller discount: {e}")
            
            # Get first media file
            c.execute("SELECT media_type, file_id FROM product_media WHERE product_id = ? LIMIT 1", (row['id'],))
            media_row = c.fetchone()
            if media_row:
                product['media_type'] = media_row['media_type']
                product['has_media'] = True
            
            products.append(product)
        
        conn.close()
        return jsonify({'success': True, 'products': products})
    
    except Exception as e:
        logger.error(f"Error getting products: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/product/<int:product_id>', methods=['GET'])
def get_product_details(product_id):
    """Get detailed product information"""
    try:
        user = get_user_from_request()
        user_id = user.get('id') if user else None
        
        conn = get_db_connection()
        c = conn.cursor()
        
        c.execute("""
            SELECT id, city, district, product_type, size, price, 
                   original_text, (available - reserved) as in_stock
            FROM products 
            WHERE id = ? AND available > reserved
        """, (product_id,))
        
        row = c.fetchone()
        if not row:
            return jsonify({'success': False, 'error': 'Product not found or out of stock'}), 404
        
        product = {
            'id': row['id'],
            'city': row['city'],
            'district': row['district'],
            'type': row['product_type'],
            'size': row['size'],
            'price': float(row['price']),
            'description': row['original_text'] or '',
            'in_stock': row['in_stock'],
            'emoji': PRODUCT_TYPES.get(row['product_type'], '📦')
        }
        
        # Calculate reseller discount
        if user_id:
            try:
                discount_percent = get_reseller_discount(user_id, row['product_type'])
                if discount_percent > 0:
                    discount_amount = float(row['price']) * discount_percent / 100
                    product['original_price'] = float(row['price'])
                    product['price'] = float(row['price']) - discount_amount
                    product['discount_percent'] = discount_percent
            except Exception as e:
                logger.error(f"Error calculating reseller discount: {e}")
        
        # Get all media files
        c.execute("SELECT media_type, file_id FROM product_media WHERE product_id = ?", (product_id,))
        media_rows = c.fetchall()
        product['media'] = [
            {'type': m['media_type'], 'file_id': m['file_id']}
            for m in media_rows
        ]
        
        conn.close()
        return jsonify({'success': True, 'product': product})
    
    except Exception as e:
        logger.error(f"Error getting product details: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/basket', methods=['GET'])
def get_basket():
    """Get user's basket"""
    try:
        user = get_user_from_request()
        if not user:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
        user_id = user.get('id')
        
        conn = get_db_connection()
        c = conn.cursor()
        
        c.execute("SELECT basket FROM users WHERE user_id = ?", (user_id,))
        row = c.fetchone()
        
        if not row or not row['basket']:
            conn.close()
            return jsonify({'success': True, 'basket': [], 'total': 0})
        
        basket_items = []
        import time
        current_time = time.time()
        
        for item_str in row['basket'].split(','):
            if not item_str:
                continue
            
            parts = item_str.split(':')
            if len(parts) < 6:
                continue
            
            product_id, timestamp = int(parts[0]), float(parts[5])
            
            # Skip expired items (15 min)
            if current_time - timestamp > 900:
                continue
            
            c.execute("""
                SELECT id, product_type, size, price, city, district
                FROM products 
                WHERE id = ?
            """, (product_id,))
            
            prod_row = c.fetchone()
            if prod_row:
                item = {
                    'product_id': prod_row['id'],
                    'type': prod_row['product_type'],
                    'size': prod_row['size'],
                    'price': float(prod_row['price']),
                    'city': prod_row['city'],
                    'district': prod_row['district'],
                    'emoji': PRODUCT_TYPES.get(prod_row['product_type'], '📦')
                }
                
                # Calculate reseller discount
                try:
                    discount_percent = get_reseller_discount(user_id, prod_row['product_type'])
                    if discount_percent > 0:
                        discount_amount = float(prod_row['price']) * discount_percent / 100
                        item['original_price'] = float(prod_row['price'])
                        item['price'] = float(prod_row['price']) - discount_amount
                        item['discount_percent'] = discount_percent
                except Exception:
                    pass
                
                basket_items.append(item)
        
        total = sum(item['price'] for item in basket_items)
        
        conn.close()
        return jsonify({'success': True, 'basket': basket_items, 'total': round(total, 2)})
    
    except Exception as e:
        logger.error(f"Error getting basket: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/basket/clear', methods=['POST'])
def clear_basket():
    """Clear user's basket"""
    try:
        user = get_user_from_request()
        if not user:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
        user_id = user.get('id')
        
        conn = get_db_connection()
        c = conn.cursor()
        
        # Get current basket
        c.execute("SELECT basket FROM users WHERE user_id = ?", (user_id,))
        row = c.fetchone()
        
        if row and row['basket']:
            # Unreserve products
            for item_str in row['basket'].split(','):
                if not item_str:
                    continue
                parts = item_str.split(':')
                if len(parts) >= 1:
                    product_id = int(parts[0])
                    c.execute("UPDATE products SET reserved = reserved - 1 WHERE id = ? AND reserved > 0", (product_id,))
        
        # Clear basket
        c.execute("UPDATE users SET basket = '' WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    
    except Exception as e:
        logger.error(f"Error clearing basket: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/discount/validate', methods=['POST'])
def validate_discount():
    """Validate discount code"""
    try:
        user = get_user_from_request()
        if not user:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
        data = request.json
        code = data.get('code', '').strip().upper()
        total = float(data.get('total', 0))
        user_id = user.get('id')
        
        valid, message, details = validate_and_apply_discount_atomic(code, total, user_id)
        
        if valid and details:
            return jsonify({
                'success': True,
                'valid': True,
                'discount_amount': float(details.get('discount_amount', 0)),
                'final_total': float(details.get('final_total', total)),
                'code': code
            })
        else:
            return jsonify({
                'success': True,
                'valid': False,
                'message': message
            })
    
    except Exception as e:
        logger.error(f"Error validating discount: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/user/balance', methods=['GET'])
def get_user_balance():
    """Get user balance"""
    try:
        user = get_user_from_request()
        if not user:
            return jsonify({'success': False, 'error': 'Unauthorized'}), 401
        
        user_id = user.get('id')
        
        conn = get_db_connection()
        c = conn.cursor()
        c.execute("SELECT balance FROM users WHERE user_id = ?", (user_id,))
        row = c.fetchone()
        conn.close()
        
        balance = float(row['balance']) if row and row['balance'] else 0.0
        
        return jsonify({'success': True, 'balance': balance})
    
    except Exception as e:
        logger.error(f"Error getting balance: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/media/<int:product_id>/<filename>')
def serve_media(product_id, filename):
    """Serve product media files"""
    try:
        media_path = os.path.join(MEDIA_DIR, str(product_id))
        return send_from_directory(media_path, filename)
    except Exception as e:
        logger.error(f"Error serving media: {e}")
        return '', 404


if __name__ == '__main__':
    # Render deployment: uses PORT env variable
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    app.run(host='0.0.0.0', port=port, debug=debug)

