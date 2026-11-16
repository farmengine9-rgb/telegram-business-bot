import 'dotenv/config';
import {createStore} from './store.js';
import {createBot} from './bot.js';
import {createServer} from './server.js';
import {addPhase4} from './phase4.js';
import {addPOS} from './pos.js';

const env=process.env;
const required=['TELEGRAM_BOT_TOKEN','OPENROUTER_API_KEY','ADMIN_PASSWORD','SESSION_SECRET'];
for(const key of required){const value=env[key]||'';if(!value||value.startsWith('replace_')){console.error(`Please set ${key} in .env`);process.exit(1);}}
if(env.ADMIN_PASSWORD.length<12||env.SESSION_SECRET.length<32){console.error('ADMIN_PASSWORD must be at least 12 characters; SESSION_SECRET at least 32 characters.');process.exit(1);}
const store=addPOS(addPhase4(await createStore(env.DATABASE_PATH||'./data/business.sqlite')));
const bot=createBot(store,env);
// Auto-resolve BotFather username so product buttons work without manual setup.
// An explicitly configured Website Settings username remains authoritative.
try {const username=await bot.getUsername();if(username){store.setSetting('telegram_bot_username',username);console.log('Telegram bot username detected: @'+username);}}
catch(error){console.warn('Telegram username lookup unavailable; configure it in Admin → Website Settings:',error.message);}
const app=createServer(store,bot,env);
const port=Number(env.PORT)||3000;
const host=env.HOST||'127.0.0.1';
const server=app.listen(port,host,()=>{
  console.log(`Public website: http://${host}:${port}/`);
  console.log(`Private admin dashboard: http://${host}:${port}/admin`);
  bot.poll().catch(err=>{console.error('Fatal polling issue:',err);process.exitCode=1;});
});
server.on('error',err=>{
  if(err.code==='EADDRINUSE')console.error(`Port ${port} is already in use. Stop older Phase 3/4 processes or set PORT=3001 in .env (only run one bot with this Telegram token).`);
  else console.error('Web server failed:',err);
  process.exitCode=1;
});
