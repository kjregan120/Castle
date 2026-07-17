/* Serves this folder (and node_modules) so the browser can load three + jolt.
   Run:  node serve.mjs      then open  http://localhost:8080          */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, join } from 'node:path';

const TYPES = {
  '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript',
  '.wasm':'application/wasm', '.json':'application/json', '.css':'text/css',
};

createServer(async (req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path === '/') path = '/viewer.html';
  const file = join(process.cwd(), normalize(path).replace(/^(\.\.[/\\])+/, ''));
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      // jolt's threaded build wants these; harmless otherwise
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found: ' + path);
  }
}).listen(8080, () => console.log('\n  siege ->  http://localhost:8080\n'));
