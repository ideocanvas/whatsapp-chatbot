import { logger } from '../src/utils/logger';

describe('Logger Utility', () => {
  // Mock console.log to test logging
  const originalConsoleLog = console.log;
  const mockLog = jest.fn();

  beforeEach(() => {
    console.log = mockLog;
    jest.clearAllMocks();
    logger.clearLogs(); // Clear logs before each test
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  test('should log AI response messages', () => {
    logger.logAIResponse('Test AI response');
    expect(mockLog).toHaveBeenCalledWith('🤖 [AI_RESPONSE] Test AI response', '');
  });

  test('should log tool call messages', () => {
    logger.logToolCall('Test tool call');
    expect(mockLog).toHaveBeenCalledWith('🛠️ [TOOL_CALL] Test tool call', '');
  });

  test('should log search messages', () => {
    logger.logSearch('Test search');
    expect(mockLog).toHaveBeenCalledWith('🔍 [SEARCH] Test search', '');
  });

  test('should log error messages', () => {
    logger.logError('Test error');
    expect(mockLog).toHaveBeenCalledWith('❌ [ERROR] Test error', '');
  });

  test('should store logs internally', () => {
    logger.logAIResponse('Test message');
    const logs = logger.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe('ai_response');
    expect(logs[0].message).toBe('Test message');
  });

  test('should filter logs by type', () => {
    logger.logAIResponse('AI message');
    logger.logError('Error message');
    const errorLogs = logger.getLogs({ type: 'error' });
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0].type).toBe('error');
    expect(errorLogs[0].message).toBe('Error message');
  });
});