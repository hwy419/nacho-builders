-- Schema for Cardano API Auth Plugin

local typedefs = require "kong.db.schema.typedefs"

return {
  name = "cardano-api-auth",
  fields = {
    { consumer = typedefs.no_consumer },
    { protocols = typedefs.protocols_http },
    {
      config = {
        type = "record",
        fields = {
          -- Auth service URL (Next.js API endpoint)
          {
            auth_url = {
              type = "string",
              required = true,
              default = "http://localhost:3000/api/auth/validate-key",
              description = "URL of the API key validation endpoint",
            },
          },
          -- Internal secret for auth service
          {
            internal_secret = {
              type = "string",
              required = true,
              description = "Shared secret for internal auth requests",
            },
          },
          -- Header name for API key
          {
            key_header = {
              type = "string",
              required = true,
              default = "apikey",
              description = "Header name containing the API key",
            },
          },
          -- Allow key in query param
          {
            key_in_query = {
              type = "boolean",
              required = true,
              default = false,
              description = "Allow API key in query parameter",
            },
          },
          -- Query param name
          {
            key_param = {
              type = "string",
              required = true,
              default = "apikey",
              description = "Query parameter name for API key",
            },
          },
          -- Timeout for auth requests
          {
            timeout = {
              type = "number",
              required = true,
              default = 5000,
              description = "Timeout for auth service requests (ms)",
            },
          },
          -- Cache TTL
          {
            cache_ttl = {
              type = "number",
              required = true,
              default = 60,
              description = "Cache TTL for validated keys (seconds)",
            },
          },
        },
      },
    },
  },
}
