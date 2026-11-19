import './env';
import { syncOutbox } from '../src/lib/service';
import { closeDatabases } from '../src/lib/db';
syncOutbox()
  .then(() => console.log('Pending outbox batch processed (up to 100 events).'))
  .catch(() => {
    console.error('Sync failed. Check the databases and retry.');
    process.exitCode = 1;
  })
  .finally(closeDatabases);
