// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

export const environment = {
  production: false,
  ws_url: 'https://mivp-dws1.erc.monash.edu:3000',
  version: 'v0.2 dev',
  firebase: {
    apiKey: 'AIzaSyCClh2ceNqqWi1D3xAxPksVXlGtHE-83rA',
    authDomain: 'previs2018.firebaseapp.com',
    databaseURL: 'https://previs2018.firebaseio.com',
    projectId: 'previs2018',
    storageBucket: 'previs2018.appspot.com',
    messagingSenderId: '12491120058'
  }
};
