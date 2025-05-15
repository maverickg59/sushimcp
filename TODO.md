1. --no-defaults flag not working
2. test cases:

--no-defaults + --url: returns only urls specified in --url command line arguments
--no-defaults + --urls: returns only urls specified in --urls command line arguments
--no-defaults + --url + --openapi-spec: returns only urls specified in --url command line arguments and --openapi-spec command line arguments
--no-defaults + --url + --urls: returns only urls specified in --url command line arguments and --urls command line arguments
--no-defaults + --url + --urls + --openapi-spec: returns only urls specified in --url command line arguments, --urls command line arguments, and --openapi-spec command line arguments

--url: returns defaults + urls specified in --url command line arguments
--urls: returns defaults + urls specified in --urls command line arguments
--url + --openapi-spec: returns defaults + urls specified in --url command line arguments and --openapi-spec command line arguments
--url + --urls: returns defaults + urls specified in --url command line arguments and --urls command line arguments
--url + --urls + --openapi-spec: returns defaults + urls specified in --url command line arguments, --urls command line arguments, and --openapi-spec command line arguments

--allow-domain: works correctly in all cases
--allow-domains: works correctly in all cases

3. modify --url and --urls flags to be --llms-txt-source and --llms-txt-sources
4. modify --openapi-spec and --openapi-specs flags to be --openapi-spec-source and --openapi-spec-sources
5. add --deny-domains flag
6. add --allow-domains flag
