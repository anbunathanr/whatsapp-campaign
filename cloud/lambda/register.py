import json
import boto3
import uuid
from datetime import datetime
import secrets
import string
import functools

dynamodb = boto3.resource('dynamodb')
users_table = dynamodb.Table('wc-users')
ses = boto3.client('ses')

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
}


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
        first_name = body['firstName']
        last_name = body['lastName']
        mobile = body.get('mobile', '')
        password = body['password']

        otp = generate_otp()

        # Trigger n8n webhook for CRM lead + OTP email
        try:
            import urllib3
            http = urllib3.PoolManager()
            n8n_payload = {
                'first_name': first_name,
                'last_name': last_name,
                'email': email,
                'mobile': mobile,
                'organization': 'WhatsApp-Campaign',
                'action': 'create_lead',
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
            print(f"[n8n] webhook failed: {e}")

        # Check if user already exists
        response = users_table.get_item(Key={'email': email.lower()})
        if 'Item' in response:
            # Update OTP for existing user
            users_table.update_item(
                Key={'email': email.lower()},
                UpdateExpression='SET otp = :otp',
                ExpressionAttributeValues={':otp': otp}
            )
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'requiresMFA': True,
                    'message': 'OTP sent to your email'
                })
            }

        # Store new user with OTP (password hashed via bcrypt not available in Lambda easily,
        # so we store a sha256 hash — production should use a proper KDF)
        import hashlib
        password_hash = hashlib.sha256(password.encode()).hexdigest()

        users_table.put_item(Item={
            'user_id': str(uuid.uuid4()),
            'email': email.lower(),
            'firstName': first_name,
            'lastName': last_name,
            'mobile': mobile,
            'passwordHash': password_hash,
            'otp': otp,
            'role': 'Org_Admin',
            'isActive': True,
            'mfa_verified': False,
            'created_at': datetime.utcnow().isoformat()
        })

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'requiresMFA': True,
                'message': 'Please check your email for OTP verification code'
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
