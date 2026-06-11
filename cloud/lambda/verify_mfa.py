import json
import boto3
import hashlib
import hmac
import time
import os

dynamodb = boto3.resource('dynamodb')
users_table = dynamodb.Table('wc-users')

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me-in-production')

CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,POST'
}


def generate_jwt(payload, secret, expires_in=86400):
    """Simple JWT generation without external libraries."""
    import base64

    header = {"alg": "HS256", "typ": "JWT"}
    payload['exp'] = int(time.time()) + expires_in
    payload['iat'] = int(time.time())

    def b64url(data):
        return base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b'=').decode()

    header_b64 = b64url(header)
    payload_b64 = b64url(payload)
    message = f"{header_b64}.{payload_b64}"

    signature = hmac.new(
        secret.encode(), message.encode(), hashlib.sha256
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).rstrip(b'=').decode()

    return f"{message}.{sig_b64}"


def lambda_handler(event, context):
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    try:
        body = json.loads(event['body'])
        email = body['email']
        mfa_code = body['mfaCode']

        response = users_table.get_item(Key={'email': email.lower()})
        if 'Item' not in response:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'User not found'})
            }

        user = response['Item']
        stored_otp = user.get('otp', '')

        if mfa_code != stored_otp:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Invalid OTP code'})
            }

        # Mark verified and clear OTP
        users_table.update_item(
            Key={'email': email.lower()},
            UpdateExpression='SET mfa_verified = :v REMOVE otp',
            ExpressionAttributeValues={':v': True}
        )

        # Generate JWT token
        token = generate_jwt(
            {
                'email': user['email'],
                'role': user.get('role', 'Org_Admin'),
                'user_id': user['user_id']
            },
            JWT_SECRET
        )

        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'success': True,
                'token': token,
                'user': {
                    'email': user['email'],
                    'firstName': user.get('firstName', ''),
                    'lastName': user.get('lastName', ''),
                    'role': user.get('role', 'Org_Admin')
                }
            })
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
