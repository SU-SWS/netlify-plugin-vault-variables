# Netlify Plugin Vault Variables

For when you want to put your environment variables in the vault.

## Configuration & Installation

1. Create an approle login with a client id and secret in your vault instance
2. Create an `.env` file in the root of your project if you don't already have one.
3. Add the variables `VAULT_ROLE_ID` and `VAULT_SECRET_ID` with the newly created values
4. Add a new script to your package.json file that executes the `script.js` file
  eg: `"vault": "netlify-plugin-vault-variables",`
5. Add configuration to your `netlify.toml` to enable this plugin
  ```
  # Fetch vault plugin needs to come before any of the contextual environment
  # variable plugins so they can act on the new vars.
  [[plugins]]
    package = "netlify-plugin-vault-variables"
    [plugins.inputs]
      # The vault service endpoint
      endpoint = 'https://vault.example.com'
      # Order doesn't matter here as these will be fetch asyncronously. Try not to have dupes.
      secrets = ['secret/data/path/project/folder1', 'secret/data/path/project/folder2']
      # Set which environment variables to use for the approle login
      secretId = 'VAULT_SECRET_ID'
      roleId = 'VAULT_ROLE_ID'
  ``` 
6. Run it with `npm run vault`

On success, you may now change and alter values in `.env` if you need to. To reset, simply remove the values from .env and run the script again.

## Environment Variable Strategy with Vault.

Environment variable file: `.env`  
We are no longer using `production` and `development` environment variable files. We use the [netlify-plugin-contextual-env](https://www.npmjs.com/package/netlify-plugin-contextual-env) plugin to support different environments. See below for more.

**Netlify-plugin-contextual-env**  
We have ported this plugin into our package to set the environment variables in the various different environments. See [the plugin page](https://www.npmjs.com/package/netlify-plugin-contextual-env) for a full set of configuration options. We are use the `prefix` option to separate out the different configuration.

**Local Development Context**
When developing on your local environment you can use the prefix `LOCAL_` to set contextual environment variables for developers. 

## Contextual Environment Variables in LAMBDA functions
This plugin will set contextual variables through Netlify's plugin API and they will be available to LAMBDA functions at runtime. 

Prefix strategy
A non-prefixed version has to exist in order for the plugin to work. For example, GATSBY_TOKEN has to exist in order for DEPLOY_PREVIEW_GATSBY_TOKEN to work. The non-prefixed version of the environment variable is the default and then overridden with the plugin at build time. The default tokens should all point to the development environments so that branch deployes, dev environments, and build previews all use that token. We then use the `PROD_` prefix to override the production environment builds.

## Environment Variables on Netlify

Netlify should support only a minimal amount of environment variables in their UI. VAULT_ROLE_ID and VAULT_SECRET_ID are required but all other environment variables should go into either a global folder or into the project specific folder.

The project specific folder eg `secret/data/projects/myProject/stuff`

As environment variables get contextualized this plugin, there is no need to separate out dev/prod variables into separate folders.

## Vault

Environment variables are stored (and versioned) in vault.stanford.edu. You can fetch them and have them written to `.env` by running `npm run vault`. You will need to add the vault role id and vault secret into the `.env` file first. You can likely find those values in the Netlify environment variables UI. If you can't find them. Please ask another developer.

When the script runs, it should only append new values to your `.env` file. This means you can have your own local environment variables or overwrite ones that are coming from vault. You can change this so that vault overwrite all values by setting the environment variable VAULT_OVERWRITE=true.
