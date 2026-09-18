# Test-only JSON adapter. Production uses OpenWrt's libubox/jshn.sh.
# jq @sh preserves quotes, newlines and shell metacharacters in RPC content.
json_load() { input="$1"; printf '%s' "$input" | jq -e 'type == "object"' >/dev/null; }
json_get_type() { eval "$1=$(printf '%s' "$input" | jq -r --arg key "$2" '.[$key] | type | @sh')"; }
json_get_var() { eval "$1=$(printf '%s' "$input" | jq -r --arg key "$2" '.[$key] | if type == "boolean" then (if . then 1 else 0 end) else . end | @sh')"; }
json_init() { output_json='{}'; }
json_add_boolean() { output_json="$(printf '%s' "$output_json" | jq --arg key "$1" --arg val "$2" '. + {($key): ($val == "1")}')"; }
json_add_string() { output_json="$(printf '%s' "$output_json" | jq --arg key "$1" --arg val "$2" '. + {($key): $val}')"; }
json_dump() { printf '%s\n' "$output_json"; }
json_load_file() { input="$(cat "$1")"; printf '%s' "$input" | jq -e 'type == "object"' >/dev/null; }
json_cleanup() { :; }
