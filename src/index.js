/* eslint-disable no-param-reassign */
// Please read the comments to learn more about the Netlify Build plugin syntax.
// Find more information in the Netlify documentation.
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const vaultReq = require('node-vault');
const { replaceContextualVars } = require('./contextualEnvVars');

/* eslint-disable no-unused-vars */
module.exports = {
  onPreBuild: async ({
    inputs,
    // Core utilities
    utils: { build, status },
    netlifyConfig,
  }) => {
    // Vault client config options.
    const options = {
      apiVersion: 'v1',
      endpoint: inputs.endpoint,
    };

    // Need some environment variables to run.
    dotenv.config();

    // Initialize the vault client with the config options.
    const vault = vaultReq(options);

    // Overwrite existing secrets.
    const overwrite = process.env.VAULT_OVERWRITE || false;
    const isNetlify = process.env.NETLIFY || false;

    console.log(
      `Overwrite existing secrets was set to: ${overwrite.toString()}`,
    );

    // Login credentials config object.
    const credentials = {
      secret_id: process.env[inputs.secretId],
      role_id: process.env[inputs.roleId],
    };

    try {
      await vault.approleLogin(credentials);
    } catch (err) {
      build.failBuild('Failed to authenticate to vault', { err });
    }

    let secrets = {};

    console.log('Fetching vault secrets and adding to env...');
    await Promise.all(
      inputs.secrets.map(async (vaultPath) => {
        try {
          const secret = await vault.read(vaultPath);
          secrets = { ...secrets, ...secret.data.data };
        } catch (err) {
          build.failBuild('Failed to fetch secret paths from vault', { err });
        }
      }),
    );

    console.log('Setting contextual prefixed env variables...');

    // If we are on Netlify pull the secrets that have been added through the UI
    // so that we can contextualize them as well.
    if (isNetlify) {
      secrets = { ...secrets, ...netlifyConfig.build.environment };

      // Ensure that dotenv gets pushed to the external bundle.
      if (!Array.isArray(netlifyConfig.functions['*'].external_node_modules)) {
        netlifyConfig.functions['*'].external_node_modules = [];
      }
      netlifyConfig.functions['*'].external_node_modules.push('dotenv');

      // Ensure that the .env file we are writing gets bundled with the func.
      // if (!Array.isArray(netlifyConfig.functions['*'].included_files)) {
      //   netlifyConfig.functions['*'].included_files = [];
      // }
      // netlifyConfig.functions['*'].included_files.push('.env');
    }

    // Contextualize the secrets.
    secrets = replaceContextualVars(secrets);

    // Store the secrets to write to the .env file.
    const secretsToWrite = [];

    // Create an array of things to write to the env file.
    Object.keys(secrets).forEach((key) => {
      if (!process.env[key] || overwrite) {
        secretsToWrite.push(`${key}=${JSON.stringify(secrets[key])}`);
      }

      if (isNetlify) {
        netlifyConfig.build.environment[key] = secrets[key];
      }
    });

    let existingSecrets = '';
    const envFilePath = path.resolve(process.cwd(), '.env');

    // Read existing env file.
    try {
      existingSecrets = fs.readFileSync(envFilePath).toString();
    } catch (err) {
      // Don't fail when no .env file already
    }

    // Write new env file.
    const vaultSecretsString = secretsToWrite.join('\n');
    const allSecretsString = `${existingSecrets}\n${vaultSecretsString}`;
    fs.writeFileSync(envFilePath, allSecretsString);

    // Put the new vars back into the env.
    dotenv.config();

    // Display success information
    status.show({
      summary: `Added environment variables from vault to environment and LAMBDA`,
    });
  },
  // Remove env file if on Netilfy.
  // onEnd: () => {
  //   const isNetlify = process.env.NETLIFY || false;
  //   const envFilePath = path.resolve(process.cwd(), '.env');
  //   if (isNetlify && fs.existsSync(envFilePath)) {
  //     fs.unlinkSync(envFilePath);
  //   }
  // },
};
