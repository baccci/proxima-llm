import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { ProviderId } from '../../../shared-contracts/providers/registry';
import type {
  RetryMessageInput,
  SendMessageInput,
} from '../../../shared-contracts/schemas/message.schema';
import type { ModelDTO } from '../../../shared-contracts/schemas/model.schema';

// launchTurn resolves the model and its key BEFORE it registers the stream in
// activeStreams. This test pins that ordering: a preflight failure has to throw
// without leaving an entry behind. Under the old order (register first, resolve
// second) the map would still hold a leaked entry after the throw.
//
// The service is imported for real, but we override just the three functions the
// preflight path touches: the two lookups (getModel, getApiKey) that decide whether
// it throws, and the user message write that runs right before them. Each override
// spreads the real module first so every other export it publishes stays intact for
// the rest of the import graph. The turn body is never reached.
let modelForTest: ModelDTO | undefined;
let apiKeyForTest: string | undefined;

const realChatRepo = await import('../../features/chat/chat.repository');
const realModelRepo = await import('../../features/model/model.repository');
const realKeychain = await import('../../infra/keychain');

mock.module('../../features/chat/chat.repository', () => ({
  ...realChatRepo,
  createUserMessage: () => ({ id: 'user-1' }),
  updateUserMessageText: () => {},
  truncateMessagesAfter: () => {},
}));
mock.module('../../features/model/model.repository', () => ({
  ...realModelRepo,
  getModel: () => modelForTest,
}));
mock.module('../../infra/keychain', () => ({
  ...realKeychain,
  getApiKey: () => apiKeyForTest,
}));

const { startChatStream, retryChatStream, activeStreams } = await import('./chat-stream.service');

const sendInput: SendMessageInput = { chatId: 'chat-1', modelId: 'model-x', content: 'hi' };
const retryInput: RetryMessageInput = {
  chatId: 'chat-1',
  modelId: 'model-x',
  userMessageId: 'user-1',
};
const validModel = { provider: ProviderId.enum.anthropic } as ModelDTO;

describe('chat-stream preflight registers nothing on failure', () => {
  beforeEach(() => {
    activeStreams.clear();
    modelForTest = undefined;
    apiKeyForTest = undefined;
  });

  afterAll(() => {
    mock.restore();
  });

  test('an unknown model throws and leaves activeStreams empty', () => {
    // getModel finds no model.
    expect(() => startChatStream(sendInput)).toThrow('Unknown model: model-x');
    expect(activeStreams.size).toBe(0);
  });

  test('a missing api key throws and leaves activeStreams empty', () => {
    modelForTest = validModel;
    // getApiKey returns nothing for the provider.
    expect(() => startChatStream(sendInput)).toThrow('No API key configured for anthropic');
    expect(activeStreams.size).toBe(0);
  });

  test('a retry preflight failure also leaves activeStreams empty', () => {
    expect(() => retryChatStream(retryInput)).toThrow('Unknown model: model-x');
    expect(activeStreams.size).toBe(0);
  });
});
