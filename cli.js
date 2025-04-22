#!/usr/bin/env node
const fs = require('fs');
const servor = require('./servor.js');
const openBrowser = require('./utils/openBrowser.js');

const readCredentials = () => ({
  cert: fs.readFileSync(__dirname + '/servor.crt'),
  key: fs.readFileSync(__dirname + '/servor.key'),
});

const certify = () =>
  require('child_process').execSync(__dirname + '/certify.sh', {
    cwd: __dirname,
  });

const open =
  process.platform == 'darwin'
    ? 'open'
    : process.platform == 'win32'
    ? 'start'
    : 'xdg-open';

(async () => {
  const args = process.argv.slice(2).filter((x) => !~x.indexOf('--'));
  const admin = process.getuid && process.getuid() === 0;
  let credentials;

  if (args[0] && args[0].startsWith('gh:')) {
    const repo = args[0].replace('gh:', '');
    const dest = repo.split('/')[1];
    if (!fs.existsSync(dest)) {
      try {
        require('child_process').execSync(
          `git clone https://github.com/${repo}`,
          { stdio: 'ignore' }
        );
      } catch (e) {
        console.log(
          `\n  ⚠️  Could not clone from https://github.com/${repo}\n`
        );
        process.exit();
      }
    }
    args[0] = dest;
  }

  if (~process.argv.indexOf('--editor')) {
    try {
      require('child_process').execSync(`code ${args[0] || '.'}`);
    } catch (e) {
      console.log(`\n  ⚠️  Could not open code editor for ${args[0] || '.'}`);
    }
  }

  // Generate ssl certificates

  if (~process.argv.indexOf('--secure')) {
    admin && certify();
    admin && process.platform === 'darwin' && process.setuid(501);
    try {
      credentials = readCredentials();
    } catch (e) {
      certify();
      try {
        credentials = readCredentials();
      } catch (e) {
        console.log(
          '\n  ⚠️  There was a problem generating ssl credentials. Try removing `--secure`\n'
        );
        process.exit();
      }
    }
  }

  const getHeaders = () => {
    // See whether an argument was provided for the `--headers` flag
    if (process.argv.indexOf('--headers') !== -1) {
      const headersContent = process.argv[process.argv.indexOf('--headers') + 1];
      if (headersContent.startsWith('@')) {
        const headersFile = headersContent.slice(1);
        // The header content is a file; try reading it (with the `@` sign removed)
        try {
          const fileContent = fs.readFileSync(headersFile);
          // Try parsing the content as JSON
          try {
            return JSON.parse(fileContent);
          } catch (error) {
            console.error(error);
            throw new Error(`Could not parse content of --headers file '${headersFile}' as JSON.`)
          }
        } catch (error) {
          console.error(error)
          throw new Error(`Could not read file '${headersFile}'`)
        }
      } else {
        // The header content is assumed to be JSON, parse it.
        try {
          return JSON.parse(headersContent);
        } catch (error) {
          console.error(error);
          throw new Error('Could not parse --headers content as JSON.')
        }
      }
    } else {
      return undefined
    }
  }

  // Parse arguments from the command line

  const { root, protocol, port, ips, url } = await servor({
    root: args[0],
    fallback: args[1],
    port: args[2],
    reload: !!~process.argv.indexOf('--reload'),
    module: !!~process.argv.indexOf('--module'),
    static: !!~process.argv.indexOf('--static'),
    headers: getHeaders(),
    credentials,
  });

  // Output server details to the console

  !~process.argv.indexOf('--silent') &&
    console.log(`
  🗂  Serving:\t${root}\n
  🏡 Local:\t${url}
  ${ips.map((ip) => `📡 Network:\t${protocol}://${ip}:${port}`).join('\n  ')}
  `);

  // Browser the server index

  !!~process.argv.indexOf('--browse') && openBrowser(url);
})();
