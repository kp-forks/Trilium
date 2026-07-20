# Setting up with various providers
## GitLab

1.  Go to user settings on [gitlab.com](https://gitlab.com/-/user_settings/applications) or your own self-hosted instance.
2.  Press _Add new application_.
3.  Give it a name (e.g. Trilium).
4.  Set _Redirect URI_ to `https://<server>/callback`
5.  Make sure _Confidential_ is checked and _Device authorization grant_ is unchecked.
6.  Under scopes, check _openid_, _profile_ and _email_ (they should be near the end).
7.  Save the application and copy the _Application ID_ and _Secret_.

Adjust `config.ini` as follows, replacing `<ApplicationId>` and `<Secret>` with the values from the last step as well as the `<server>` with a URL to your Trilium instance. If you are using a self-hosted instance of GitLab, make sure to also update `oauthIssuerBaseUrl`.

```
[MultiFactorAuthentication]
oauthBaseUrl=https://<server>
oauthClientId=<ApplicationId>
oauthClientSecret=<Secret>
oauthIssuerBaseUrl=https://gitlab.com
oauthIssuerName=GitLab
```