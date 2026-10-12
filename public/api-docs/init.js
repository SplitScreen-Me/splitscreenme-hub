// Swagger UI bootstrap for /api/v3/docs (a file, not an inline script: the page CSP allows 'self' only).
window.addEventListener('DOMContentLoaded', function () {
  window.ui = SwaggerUIBundle({
    url: '/api/v3/openapi.json',
    dom_id: '#swagger',
    deepLinking: true,
    tryItOutEnabled: false,
    // No call to the public validator (the CSP forbids it, and the document is checked by our tests).
    validatorUrl: null,
    docExpansion: 'list',
    defaultModelsExpandDepth: 0,
    defaultModelExpandDepth: 2,
    displayRequestDuration: true,
    filter: true,
    showExtensions: false,
    syntaxHighlight: { activated: true, theme: 'agate' },
  });
});
