## Manual Testing Procedures

### Test With Defaults Only

/Users/christopherwhite/Develop/projects/sushimcp/sushimcp/dist/index.js

### Test No Defaults

/Users/christopherwhite/Develop/projects/sushimcp/sushimcp/dist/index.js --no-defaults

### Test With Defaults + llms.txt Source + llms.txt Sources + OpenAPI Spec + OpenAPI Specs

/Users/christopherwhite/Develop/projects/sushimcp/sushimcp/dist/index.js --llms-txt-source example:https://example.com --llms-txt-sources "example1:https://example1.com example2:https://example2.com" --openapi-spec-source example3:https://example3.com --openapi-spec-sources "example4:https://example4.com example5:https://example5.com local_sushi_api:http://localhost:8787/api/v1/openapi.json"

### Test OpenAPI Spec

{"url": "http://localhost:8787/api/v1/openapi.json"}

### Test OpenAPI Specs

["http://localhost:8787/api/v1/openapi.json"]

### Test llms.txt Source

[{"url": "http://localhost:8787/api/v1/mcp"}]

### llms.txt Sourcea

["http://localhost:8787/api/v1/mcp"]
