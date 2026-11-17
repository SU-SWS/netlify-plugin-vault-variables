/* eslint-disable no-param-reassign */
// Please read the comments to learn more about the Netlify Build plugin syntax.
// Find more information in the Netlify documentation.
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const vaultReq = require('node-vault');
const { replaceContextualVars } = require('./contextualEnvVars');

// Hints for common Vault status codes, shown with the error.
const LOGIN_HINTS = {
  400: 'Check that the role ID and secret ID are correct and belong to the same approle.',
};
const READ_HINTS = {
  403: "The approle that logged in isn't allowed to read this path. Check its Vault policies, and check that the build uses the role ID and secret ID you expect.",
  404: 'No secret exists at this path. KV v2 paths need /data/ after the mount, e.g. secret/data/projects/my-project.',
};

/**
 * Describe a node-vault error for the build log.
 *
 * Uses only the HTTP status and Vault's own error messages (for example
 * "permission denied"), never the raw error object, so request details such
 * as the Vault token can't end up in the log.
 */
const describeVaultError = (err, hints = {}) => {
  const status = err?.response?.statusCode;
  const vaultErrors = err?.response?.body?.errors;
  const raw =
    Array.isArray(vaultErrors) && vaultErrors.length
      ? vaultErrors.join('\n')
      : err?.message || String(err);
  // Vault wraps messages like "1 error occurred:\n\t* permission denied".
  const detail = raw
    .replace(/^\d+ errors? occurred:/i, '')
    .split(/\n|\*/)
    .map((part) => part.trim())
    .filter((part) => part && part !== `Status ${status}`)
    .join('; ');
  const hint = status && hints[status] ? ` ${hints[status]}` : '';
  const summary = status ? `Vault returned ${status}` : 'Vault request failed';
  return `${summary}${detail ? `: ${detail}` : ''}.${hint}`;
};

/* eslint-disable no-unused-vars */
module.exports = {
  async onPreBuild({
    inputs,
    // Core utilities
    utils: { build, status },
    netlifyConfig,
  }) {
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
      `Overwrite existing secrets was set to: ${overwrite.toString()}`
    );

    // The roleId and secretId inputs name the environment variables that hold
    // the approle credentials. Fail early, and say which ones, if they're unset.
    const missing = [inputs.roleId, inputs.secretId].filter(
      (name) => !process.env[name]
    );
    if (missing.length) {
      build.failBuild(
        `Missing environment variable(s) for the vault approle login: ${missing.join(
          ', '
        )}. Set them (in Netlify, or in .env locally), or point the roleId and secretId plugin inputs at the right variables.`
      );
      return;
    }

    // Login credentials config object.
    const credentials = {
      secret_id: process.env[inputs.secretId],
      role_id: process.env[inputs.roleId],
    };

    let login;
    try {
      login = await vault.approleLogin(credentials);
    } catch (err) {
      build.failBuild(
        `Failed to authenticate to vault at ${inputs.endpoint} with ${
          inputs.roleId
        } / ${inputs.secretId}. ${describeVaultError(err, LOGIN_HINTS)}`
      );
      return;
    }

    // Log which approle logged in (names only, not secret), so a build that
    // picked up the wrong credentials is easy to spot.
    const auth = login?.auth || {};
    const roleName = auth.metadata?.role_name || 'unknown role';
    const policies = (auth.token_policies || auth.policies || []).join(', ');
    console.log(
      `Authenticated to vault as "${roleName}" (policies: ${
        policies || 'none'
      }) using ${inputs.roleId} / ${inputs.secretId}.`
    );

    let secrets = {};

    console.log('Fetching vault secrets and adding to env...');
    await Promise.all(
      inputs.secrets.map(async (vaultPath) => {
        try {
          const secret = await vault.read(vaultPath);
          secrets = { ...secrets, ...secret.data.data };
        } catch (err) {
          build.failBuild(
            `Failed to fetch secret path "${vaultPath}" from vault as "${roleName}". ${describeVaultError(
              err,
              READ_HINTS
            )}`
          );
        }
      })
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
    }

    // Contextualize the secrets.
    secrets = replaceContextualVars(secrets);

    // Store the secrets to write to the .env file.
    const secretsToWrite = [];

    // Add the context var so we can access it during runtime using dotenv.
    if (inputs.addContext === true) {
      console.log('Adding CONTEXT to the .env file', process.env.CONTEXT);
      secretsToWrite.push(`CONTEXT=${process.env.CONTEXT}`);
    }

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
      summary: `Added ${secretsToWrite.length} environment variables from vault to this build.`,
    });
  },
};
