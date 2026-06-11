import json
import boto3
import hashlib
import functools
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
users_table = dynamodb.Table('wc-users')

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
}

MAX_FAILED_ATTEMPTS = 5


@functools.lru_cache(maxsize=1)
def get_frappe_api_token():
    """Fetch Frappe API token from Secrets Manager."""
    client = boto3.client('secretsmanager', region_name='us-east-1')
    response = client.get_secret_value(
        SecretId='arn:aws:secretsmanager:us-east-1:976193236457:secret:opencrm/frappe-api-key-iQgSaZ'
    )
    secret = response['SecretString'].strip()
    if secret.startswith('token '):
        return secret
    return f'token {secret}'


def generate_otp():
    import random
    return str(random.randint(100000, 999999))


def lambda_handler(event, context):
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    try:
        body = json.loads(event['body'])
        email = body['email']
        password = body['password']

        response = users_table.get_item(Key={'email': email.lower()})
        if 'Item' not in response:
            return {
                'statusCode': 401,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Invalid credentials'})
            }

        user = response['Item']

        # Check account lockout
        failed_attempts = int(user.get('failedLoginAttempts', 0))
        if failed_attempts >= MAX_FAILED_ATTEMPTS:
            return {
                'statusCode': 423,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Account temporarily locked. Try again later.'})
            }

        # Verify password
        password_hash = hashlib.sha256(password.encode()).hexdigest()
        if password_hash != user.get('passwordHash', ''):
            # Increment failed attempts
            users_table.update_item(
                Key={'email': email.lower()},
                UpdateExpression='SET failedLoginAttempts = :f',
                ExpressionAttributeValues={':f': failed_attempts + 1}
            )
            return {
                'statusCode': 401,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Invalid credentials'})
            }

        # Check if account is active
        if not user.get('isActive', True):
            return {
                'statusCode': 403,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Account is disabled'})
            }

        # Reset failed attempts, generate OTP
        otp = generate_otp()
        users_table.update_item(
            Key={'email': email.lower()},
            UpdateExpression='SET failedLoginAttempts = :z, otp = :otp, lastLogin = :t',
            ExpressionAttributeValues={
                ':z': 0,
                ':otp': otp,
                ':t': datetime.utcnow().isoformat()
            }
        )

        # Send OTP via n8n webhook
        try:
            import urllib3
            http = urllib3.PoolManager()
            n8n_payload = {
                'first_name': user.get('firstName', ''),
                'last_name': user.get('lastName', ''),
                'email': email,
                'mobile': user.get('mobile', ''),
                'organization': 'WhatsApp-Campaign',
                'action': 'send_otp',
                'otp': otp,
                'send_otp': True
            }
            http.request(
                'POST',
                'https://n8n.digitransolutions.in/webhook/digitranva-lead-intake',
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': get_frappe_api_token()
                },
                body=json.dumps(n8n_payload)
            )
        except Exception as e:
            print(f"[n8n] OTP webhook failed: {e}")

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'requiresMFA': True,
                'message': 'OTP sent to your email'
            })
        }

    except KeyError as e:
        return {
            'statusCode': 400,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': f'Missing required field: {str(e)}'})
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
