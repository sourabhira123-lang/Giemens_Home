export type NotificationChannel = "EMAIL" | "SMS" | "WHATSAPP";
export type NotificationStatus = "QUEUED" | "SENT" | "FAILED";

export type NotificationRequest = {
  channel: NotificationChannel;
  recipient: string;
  templateId: string;
  data: Readonly<Record<string, string>>;
  idempotencyKey: string;
  correlationId: string;
};

export type NotificationReceipt = {
  id: string;
  status: NotificationStatus;
  queuedAt: string;
};

export interface NotificationService {
  send(request: NotificationRequest): Promise<NotificationReceipt>;
}

export type QueueMessage<T> = {
  id: string;
  topic: string;
  payload: T;
  createdAt: string;
  correlationId: string;
};

export type QueueHandlerOptions = {
  concurrency?: number;
  visibilityTimeoutSeconds?: number;
};

export interface MessageQueue {
  publish<T>(message: QueueMessage<T>): Promise<void>;
  subscribe<T>(
    topic: string,
    handler: (message: QueueMessage<T>) => Promise<void>,
    options?: QueueHandlerOptions,
  ): Promise<() => Promise<void>>;
}

export type WebhookRequest = {
  headers: Readonly<Record<string, string | undefined>>;
  body: Uint8Array;
  receivedAt: string;
};

export type WebhookResponse = {
  statusCode: number;
  body?: string;
};

export interface WebhookAuthenticator {
  verify(request: WebhookRequest): Promise<boolean>;
}

export interface WebhookHandler {
  handle(request: WebhookRequest): Promise<WebhookResponse>;
}
