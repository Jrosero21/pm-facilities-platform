import assert from "node:assert/strict";

import {
  isBearerTokenAuthorized,
} from "./read-auth";

console.log(
  "----- FOREMAN READ AUTH -----",
);

assert.equal(
  isBearerTokenAuthorized(
    null,
    "secret",
  ),
  false,
);

console.log(
  "Missing authorization header rejected: PASS",
);

assert.equal(
  isBearerTokenAuthorized(
    "Bearer wrong",
    "secret",
  ),
  false,
);

console.log(
  "Wrong bearer token rejected: PASS",
);

assert.equal(
  isBearerTokenAuthorized(
    "Basic secret",
    "secret",
  ),
  false,
);

console.log(
  "Wrong authentication scheme rejected: PASS",
);

assert.equal(
  isBearerTokenAuthorized(
    "Bearer secret",
    "secret",
  ),
  true,
);

console.log(
  "Correct bearer token accepted: PASS",
);

assert.equal(
  isBearerTokenAuthorized(
    "Bearer secret",
    undefined,
  ),
  false,
);

console.log(
  "Unset server secret fails closed: PASS",
);

console.log("");
console.log(
  "FOREMAN READ AUTH: PASS",
);
