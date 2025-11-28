export interface WhatsAppMessage {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          text?: {
            body: string;
          };
          image?: {
            id: string;
            mime_type: string;
            sha256: string;
            caption?: string;
          };
          audio?: {
            id: string;
            mime_type: string;
            sha256: string;
          };
          type: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

export interface WhatsAppResponse {
  messaging_product: string;
  to: string;
  text: {
    body: string;
  };
}

export interface WhatsAppAPIConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}