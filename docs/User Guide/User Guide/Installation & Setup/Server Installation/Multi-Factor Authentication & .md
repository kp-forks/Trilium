# Multi-Factor Authentication & OpenID Connect
Multi-factor authentication (MFA) is a security process that requires users to provide two or more verification factors to gain access to a system, application, or account. This adds an extra layer of protection beyond just using a password.

By requiring more than one verification method, MFA helps reduce the risk of unauthorized access, even if someone has obtained your password. It’s highly recommended for securing sensitive information stored in your notes.

> [!WARNING]
> OpenID and TOTP cannot be both used at the same time!

## Time-based one-time password (TOTP)

TOTP (Time-Based One-Time Password) is a security feature that generates a unique, temporary code on your device, like a smartphone, which changes every 30 seconds. You use this code, along with your password, to log into your account, making it much harder for anyone else to access them.

1.  Go to <a class="reference-link" href="../../Basic%20Concepts%20and%20Features/UI%20Elements/Options.md">Options</a> → _Password & Auth._
2.  Make sure _Sign-in with_ has _Local password_ selected.
3.  In the _Two-factor authentication_ section, press _Set up._
4.  Scan the QR code or manually enter the code in your authenticator app.
5.  Enter the verification code from your authenticator app to confirm that the setup was successful and press _Verify & continue_.
6.  Save the recovery codes. Recovery codes can be used once in place of the TOTP if you lose access to your authenticator.
7.  Re-login will be required after TOTP setup is finished (After you refreshing the page).

## Signing in OpenID Connect

OpenID is a standardized way to let you log into websites using an account from another service, like Google, to verify your identity.

In order to setup OpenID, you will need to setup a authentication provider. This requires a bit of extra setup. Follow [these instructions](https://developers.google.com/identity/openid-connect/openid-connect) to setup an OpenID service through Google. The Redirect URL of Trilium is `https://<your-trilium-domain>/callback`.

1.  Set the `oauthBaseUrl`, `oauthClientId` and `oauthClientSecret` in the `config.ini` file (check <a class="reference-link" href="../../Advanced%20Usage/Configuration%20(config.ini%20or%20e.md">Configuration (config.ini or environment variables)</a> for more information).
    1.  You can also setup through environment variables:
        *   Standard: `TRILIUM_MULTIFACTORAUTHENTICATION_OAUTHBASEURL`, `TRILIUM_MULTIFACTORAUTHENTICATION_OAUTHCLIENTID`, `TRILIUM_MULTIFACTORAUTHENTICATION_OAUTHCLIENTSECRET`
        *   Legacy (still supported): `TRILIUM_OAUTH_BASE_URL`, `TRILIUM_OAUTH_CLIENT_ID`, `TRILIUM_OAUTH_CLIENT_SECRET`
    2.  `oauthBaseUrl` should be the link of your Trilium instance server, for example, `https://<your-trilium-domain>`.
2.  Restart the server.
3.  Go to <a class="reference-link" href="../../Basic%20Concepts%20and%20Features/UI%20Elements/Options.md">Options</a> → _Password & Auth._
4.  In the _Sign-in with_ field, choose _OpenID Connect provider._
5.  Refresh the page and login through OpenID provider.

### Alternative OAuth issuers

The default OAuth issuer is Google. To use other services such as Authentik or Auth0, you can configure the settings via `oauthIssuerBaseUrl`, `oauthIssuerName`, and `oauthIssuerIcon` in the `config.ini` file. Alternatively, these values can be set using environment variables:

*   Standard: `TRILIUM_MULTIFACTORAUTHENTICATION_OAUTHISSUERBASEURL`, `TRILIUM_MULTIFACTORAUTHENTICATION_OAUTHISSUERNAME`, `TRILIUM_MULTIFACTORAUTHENTICATION_OAUTHISSUERICON`
*   Legacy (still supported): `TRILIUM_OAUTH_ISSUER_BASE_URL`, `TRILIUM_OAUTH_ISSUER_NAME`, `TRILIUM_OAUTH_ISSUER_ICON`

`oauthIssuerName` and `oauthIssuerIcon` are required for displaying correct issuer information at the Login page.

#### Authentik

> [!NOTE]
> If you don’t already have a running Authentik instance, please follow [these instructions](https://docs.goauthentik.io/docs/install-config/install/docker-compose) to set one up.

1.  In the Authentik admin dashboard, create a new OAuth2 application by following [these steps](https://docs.goauthentik.io/docs/add-secure-apps/providers/oauth2/create-oauth2-provider). Make sure to set the Redirect URL to: `https://<your-trilium-domain>/callback`.
2.  In your config.ini file, set the relevant OAuth variables:
    1.  `oauthIssuerBaseUrl` → Use the `OpenID Configuration Issuer` URL from your application's overview page.
    2.  `oauthIssuerName` and `oauthIssuerIcon` → Set these to customize the name and icon displayed on the login page. If omitted, Google’s name and icon will be shown by default.
3.  Apply the changes by restarting your server.
4.  Proceed with the remaining steps starting from Step 3 in the OpenID section.