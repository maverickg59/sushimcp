1. test cases:

--no-defaults + --url: returns only urls specified in --url command line arguments
--no-defaults + --urls: returns only urls specified in --urls command line arguments
--no-defaults + --url + --openapi-spec-source: returns only urls specified in --url command line arguments and --openapi-spec-source command line arguments
--no-defaults + --url + --urls: returns only urls specified in --url command line arguments and --urls command line arguments
--no-defaults + --url + --urls + --openapi-spec-source: returns only urls specified in --url command line arguments, --urls command line arguments, and --openapi-spec-source command line arguments

--url: returns defaults + urls specified in --url command line arguments
--urls: returns defaults + urls specified in --urls command line arguments
--url + --openapi-spec-source: returns defaults + urls specified in --url command line arguments and --openapi-spec-source command line arguments
--url + --urls: returns defaults + urls specified in --url command line arguments and --urls command line arguments
--url + --urls + --openapi-spec-source: returns defaults + urls specified in --url command line arguments, --urls command line arguments, and --openapi-spec-source command line arguments

--allow-domain: works correctly in all cases
--allow-domains: works correctly in all cases

2. add --deny-domains flag
