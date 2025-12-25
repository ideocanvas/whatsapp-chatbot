import { AutonomousServer } from './server';

// Start the autonomous server
const server = new AutonomousServer();
server.start().catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => server.stop());
process.on('SIGTERM', () => server.stop());