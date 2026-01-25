-- Cardano API Auth Plugin for Kong
-- Validates API keys against PostgreSQL database
-- Supports the napi_ prefixed keys from the web application
-- Includes in-memory caching to reduce auth service load

local http = require "resty.http"
local cjson = require "cjson.safe"
local sha256 = require "resty.sha256"
local str = require "resty.string"

local CardanoApiAuth = {
  PRIORITY = 1000,
  VERSION = "1.2.0",  -- Fixed negative caching for invalid keys
}

-- Helper function to hash the API key (used for cache key)
local function hash_key(key)
  local sha = sha256:new()
  if not sha then
    return nil, "failed to create sha256 instance"
  end
  sha:update(key)
  local digest = sha:final()
  return str.to_hex(digest)
end

-- Fetch auth result from the upstream service (called on cache miss)
-- IMPORTANT: Always returns a table (never nil) to ensure Kong caches the result
-- Invalid/error responses are cached as { valid = false, error = "reason" }
local function fetch_auth_from_service(conf, api_key)
  local httpc = http.new()
  httpc:set_timeout(conf.timeout)

  -- Call the auth validation endpoint
  local res, err = httpc:request_uri(conf.auth_url, {
    method = "POST",
    headers = {
      ["Content-Type"] = "application/json",
      ["X-Internal-Secret"] = conf.internal_secret,
    },
    body = cjson.encode({
      apiKey = api_key,
    }),
  })

  if not res then
    kong.log.err("Failed to call auth service: ", err)
    -- Don't cache service unavailable errors - return nil so caller can retry
    return nil, "auth service unavailable"
  end

  if res.status == 401 then
    -- Return a table so Kong caches this invalid key result
    return { valid = false, error = "invalid api key" }
  end

  if res.status ~= 200 then
    kong.log.err("Auth service returned status: ", res.status)
    -- Return a table so Kong caches this error result
    return { valid = false, error = "auth service error" }
  end

  local body = cjson.decode(res.body)
  if not body then
    return { valid = false, error = "invalid auth response" }
  end

  -- Mark valid responses
  body.valid = true
  return body
end

-- Validate API key with caching
local function validate_key(conf, api_key)
  -- Generate cache key from hashed API key
  local cache_key, hash_err = hash_key(api_key)
  if not cache_key then
    kong.log.warn("Failed to hash key for cache: ", hash_err)
    -- Fall back to direct validation without cache
    return fetch_auth_from_service(conf, api_key)
  end

  local cache_key_full = "cardano_api_auth:" .. cache_key

  -- Try to get from Kong's cache
  local auth_result, err = kong.cache:get(
    cache_key_full,
    { ttl = conf.cache_ttl },
    fetch_auth_from_service,
    conf,
    api_key
  )

  if err then
    kong.log.err("Cache lookup failed: ", err)
    -- Fall back to direct validation
    return fetch_auth_from_service(conf, api_key)
  end

  return auth_result
end

function CardanoApiAuth:access(conf)
  -- Get API key from header
  local api_key = kong.request.get_header(conf.key_header)

  -- Also check query param as fallback
  if not api_key and conf.key_in_query then
    local query = kong.request.get_query()
    api_key = query[conf.key_param]
  end

  if not api_key then
    return kong.response.exit(401, {
      message = "No API key provided",
      hint = "Include your API key in the '" .. conf.key_header .. "' header",
    })
  end

  -- Validate the key
  local auth_result, err = validate_key(conf, api_key)

  if not auth_result then
    return kong.response.exit(401, {
      message = err or "Invalid API key",
    })
  end

  -- Check if result indicates invalid key (cached negative result)
  if auth_result.valid == false then
    return kong.response.exit(401, {
      message = auth_result.error or "Invalid API key",
    })
  end

  -- Check if key is active
  if not auth_result.active then
    return kong.response.exit(403, {
      message = "API key is inactive",
    })
  end

  -- Check expiration
  if auth_result.expired then
    return kong.response.exit(403, {
      message = "API key has expired",
    })
  end

  -- For PAID tier, check credits
  if auth_result.tier == "PAID" and auth_result.credits <= 0 then
    return kong.response.exit(402, {
      message = "Insufficient credits",
      credits = auth_result.credits,
    })
  end

  -- Set headers for upstream and logging
  kong.service.request.set_header("X-Api-Key-Id", auth_result.keyId)
  kong.service.request.set_header("X-User-Id", auth_result.userId)
  kong.service.request.set_header("X-Api-Tier", auth_result.tier)
  kong.service.request.set_header("X-Rate-Limit", tostring(auth_result.rateLimit or 100))

  -- Set consumer context for rate limiting
  kong.ctx.shared.api_key_id = auth_result.keyId
  kong.ctx.shared.user_id = auth_result.userId
  kong.ctx.shared.tier = auth_result.tier
  kong.ctx.shared.rate_limit = auth_result.rateLimit
end

return CardanoApiAuth
