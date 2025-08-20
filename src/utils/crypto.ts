import * as crypto from 'crypto';

export class CryptoUtils {
  static verifySignature(
    appSecret: string,
    requestBody: string,
    signatureHeader?: string
  ): boolean {
    if (!signatureHeader) {
      console.log('No signature header provided');
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(requestBody, 'utf8')
      .digest();

    const signatureParts = signatureHeader.split('=');
    console.log('verifySignature()', {signatureHeader, signatureParts})
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      console.log('Invalid signature format');
      return false;
    }

    const providedSignature = Buffer.from(signatureParts[1], 'hex');
    console.log('verifySignature()', {expectedSignature, providedSignature})
    return crypto.timingSafeEqual(expectedSignature, providedSignature);
  }
}