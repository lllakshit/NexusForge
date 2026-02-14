package nexusforge

default allow := false

public_paths := {
  "/health",
  "/auth/register",
  "/auth/login",
  "/auth/verify",
  "/mcp/discovery"
}

allow if {
  input.path in public_paths
}

allow if {
  input.method == "OPTIONS"
}

allow if {
  input.roles[_] == "admin"
}

allow if {
  input.path == "/projects"
  input.method == "GET"
  input.user_id != ""
}

allow if {
  startswith(input.path, "/projects/")
  input.user_id != ""
}

allow if {
  startswith(input.path, "/jobs")
  input.user_id != ""
}

allow if {
  startswith(input.path, "/files")
  input.user_id != ""
}

allow if {
  startswith(input.path, "/logs")
  input.user_id != ""
}

allow if {
  startswith(input.path, "/mcp")
  input.user_id != ""
}
