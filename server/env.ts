import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
// This runs before the cache module resolves DATA_DIR. Existing environment wins.
if(existsSync('.env'))loadEnvFile('.env');
