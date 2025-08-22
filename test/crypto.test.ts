import * as crypto from 'crypto';
import { CryptoUtils } from '../src/utils/crypto';

describe('Crypto Utils', () => {
  const appSecret = 'test-app-secret';
  const requestBody = '{"message": "Hello, World!"}';

  test('should verify valid signature correctly', () => {
    // Generate a valid signature
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(requestBody, 'utf8')
      .digest('hex');

    const signatureHeader = `sha256=${expectedSignature}`;
    const result = CryptoUtils.verifySignature(appSecret, requestBody, signatureHeader);

    expect(result).toBe(true);
  });

  test('should return false for missing signature header', () => {
    const result = CryptoUtils.verifySignature(appSecret, requestBody);
    expect(result).toBe(false);
  });

  test('should return false for invalid signature format', () => {
    const result = CryptoUtils.verifySignature(appSecret, requestBody, 'invalid-format');
    expect(result).toBe(false);
  });

  test('should return false for empty signature header', () => {
    const result = CryptoUtils.verifySignature(appSecret, requestBody, '');
    expect(result).toBe(false);
  });

  test('should return false for incorrect signature', () => {
    // Generate a valid signature but with different content
    const differentBody = '{"message": "Different content!"}';
    const incorrectSignature = crypto
      .createHmac('sha256', appSecret)
      .update(differentBody, 'utf8')
      .digest('hex');

    const signatureHeader = `sha256=${incorrectSignature}`;
    const result = CryptoUtils.verifySignature(appSecret, requestBody, signatureHeader);
    expect(result).toBe(false);
  });
});