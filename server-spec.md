We want to implement a server in Deno and UI components to accompany it.
The server will use as a database Deno KV which is enabled by the `--unstable-kv` flag.
All KV entry views will be as denormalized as possible always so there are as few calls to KV as possible.

We first implement authentication and password encryption using bcrypt `https://jsr.io/@da/bcrypt`.
The authentication UI is to be inserted in the Sidebar where the loops load (when you are not authenticated there are no loops to load.).

All KV entry types should use as little data as possible.
For example the 'comments' field in a 'Loop' entry does not need the 'loopId' field (it's already denormalized in it).

All requests and responses should be validated with zod `jsr:@zod/zod`
and we should be exporting inferred types for all to use in the frontend.

Next, we implement LoopData and storing and retrieving loops.
The loops of the user should also be denormalized in the user session object so when they authenticate we don't do second call to the db,
but without the 'code' and 'comments' data. These are to be fetched when we explicitly fetch a loop on its own.
These should be hooked into the frontend store and we remove the mock fetch, setup a Vite config proxy for `/api` and add the necessary scripts to run the server in `package.json` and using `concurrently` with `bun` we start both the `api` and the `web` projects concurrently with `bun dev`.

Be wary of the fact that a KV entry can only be max 64kb in size so it has to be compact at denormalization, otherwise we should do multiple calls
to the KV db when the request happens.

Use 'hono' `jsr:@hono/hono` for the API layer.

Keep it as minimal as possible and make separate files for everything so it is maintainable.
