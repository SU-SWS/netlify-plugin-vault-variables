const path = require("path");
const fs = require("fs");
const toml = require("toml");
const vault = require("node-vault");

export const fetchVaultSecrets = async () => {
  const tomlPath = path.resolve(process.cwd(), 'netlify.toml');
  console.log(`Toml file path: ${tomlPath}`);

  const tomlString = fs.readFileSync(tomlPath, 'utf8');
  const tomlData = toml.parse(tomlString);

  // Find the plugin config.
  const pluginConfig = tomlData.plugins.find((element) => {
    if (element.package.includes('netlify-plugin-vault-variables')) {
      return true;
    }
    return false;
  });

  // No config???
  if (!pluginConfig) {
    throw Error('No plugin config found.');
  }

  const options = {
    apiVersion: 'v1',
    endpoint: pluginConfig.inputs.endpoint
  }

  const vaultClient = vault(options);
  let secrets = {};

  await vaultClient.approleLogin({ role_id: process.env[pluginConfig.inputs.roleId], secret_id: process.env[pluginConfig.inputs.secretId] });
  for (const folder of pluginConfig.inputs.secrets) {
    secrets[folder] = await vaultClient.read(folder).then(res => res.data.data);
  }
  
  return secrets;
}
