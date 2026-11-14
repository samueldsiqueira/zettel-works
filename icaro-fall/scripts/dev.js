// Sobe servidor de jogo (3001) + Vite (5173) juntos.
import { spawn } from 'node:child_process';
const procs = [
  spawn('node', ['--watch', 'server/index.js'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
