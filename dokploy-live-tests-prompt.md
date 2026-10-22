You are running live tests on our self-hosted Dokploy for a deployment plan. Report facts with evidence (commands, HTTP status codes, timings, Dokploy UI or API status). Don't guess: if something can't be tested, say why.

## Ground rules

- Create only the test resources listed below. Don't change any existing project, app, database, domain, DNS record or Dokploy setting.
- Use a generated `traefik.me` domain for the test app, so no DNS change is needed.
- Dokploy's API: `https://<dokploy-host>/api/<router>.<procedure>`, header `x-api-key: <key>`. GET for queries (parameters in the query string), POST with a JSON body for mutations. If a procedure name below differs, check `https://<dokploy-host>/swagger`.
- At the end, list everything you created and ask the owner before deleting anything.

## The test image

`ghcr.io/irma-ai/temp` (public) has three tags. All listen on port 3000 and have a Docker HEALTHCHECK on `/health`.

- `probe-a` and `probe-b`: healthy. `GET /version` returns `{"version":"probe-a"}` or `{"version":"probe-b"}`.
- `probe-broken`: `/health` returns 500, so the container never becomes healthy.

Other routes:
- `GET /sse?keepalive=N`: a server-sent events stream with a `: ka` comment every N seconds (0 = none).
- `GET /db`: LISTEN status and reconnect count.
- `POST /notify`: sends `pg_notify('changes', ...)`, which appears on open streams as `event: change`. After a lost LISTEN connection reconnects, open streams get `event: resync`.

## Part 1: setup (your admin access)

1. Create project `live-tests` with an application `probe`. Docker provider, image `ghcr.io/irma-ai/temp:probe-a`, no registry login. Give it a generated `traefik.me` domain on port 3000. Deploy it, and confirm `GET http://<domain>/version` returns probe-a.
2. Create a second project `live-tests-other` with an application `probe-other`. Same image, no domain needed.
3. Note both applicationIds.
4. Stop and ask the owner for these, then wait:
   - A Dokploy **member** user that has access only to project `live-tests` / application `probe`, with no create or delete rights.
   - An API key created while logged in as that member user.

## Part 2: tests

**T1. The member key's scope.** Using only the member's API key, try each call and record the HTTP status and a short excerpt:
- a. `application.one` for `probe` (expect allowed).
- b. `application.one` for `probe-other` (expect denied).
- c. `project.all` (which projects are listed?).
- d. `application.saveDockerProvider` on `probe` with image `ghcr.io/irma-ai/temp:probe-b`, then `application.deploy` on `probe` (expect allowed).
- e. The same two calls on `probe-other` (expect denied).
- f. Reading and writing `probe`'s environment variables (`application.one` fields, `application.saveEnvironment`). We expect this to be allowed; confirm.
- g. Admin-level calls: list users, server settings, list all Docker containers, create a project (expect denied).

**T2. Following a deploy through `/version`.** With the member key, pin `probe-a` and deploy, then pin `probe-b` and deploy. For each:
- Does `application.deploy` return before the deploy finishes?
- How many seconds pass from the call returning until `/version` shows the new tag (poll once a second)?

**T3. Zero downtime and rollback.**
- In `probe`'s advanced or Swarm settings, set the update config to `{"Parallelism":1,"Order":"start-first","FailureAction":"rollback","Monitor":30000000000,"Delay":5000000000}`, and a rollback config with `"Order":"start-first"`. Record exactly what you set and where.
- Healthy update: while polling `/version` every 0.5 s, deploy `probe-a`, then `probe-b`. Count any non-200 responses or connection errors during the switch.
- Broken update: while polling the same way, deploy `probe-broken`. Record:
  - whether `/version` stays `probe-b` the whole time;
  - what Dokploy shows for that deployment (done, error or something else, in the UI and through the API);
  - whether Swarm rolled back (`docker service inspect <service> --format '{{json .UpdateStatus}}'`, if you have server access);
  - how long the whole thing took.
- Finally, redeploy `probe-b` so the app is healthy again.

**T4. SSE through Dokploy's Traefik.** Use the app's domain, over HTTPS too if the generated domain has a certificate.
- `curl -N "http://<domain>/sse?keepalive=25"` for 5 minutes. Does the stream stay open, and do the `: ka` lines arrive every 25 s?
- `curl -N "http://<domain>/sse?keepalive=0"` for up to 4 minutes. Is it cut, and after how many seconds exactly?

**T5. LISTEN recovery after a PostgreSQL restart.**
- In `live-tests`, create a PostgreSQL 16 database service.
- Set `probe`'s environment variable `DATABASE_URL` to the database's internal connection URL, and redeploy `probe-b`.
- Check that `GET /db` shows `"listening":true`.
- Open `curl -N "http://<domain>/sse?keepalive=25"` in the background, `POST /notify`, and confirm `event: change` arrives.
- Restart the PostgreSQL service in Dokploy. Record:
  - `/db` during the restart and afterwards (`listening`, `reconnects`, `lastError`);
  - whether the open stream received `event: resync`;
  - whether a new `POST /notify` reaches the stream;
  - how many seconds recovery took.

## Report

A table with columns `Test | Result (pass / fail / couldn't test) | Evidence`, one row per lettered or bulleted check. Then answer these directly:
1. Can a member user's key pin an image and deploy its own app, and is it denied everywhere else?
2. Does the deploy call return before the deploy finishes?
3. Does Dokploy (not just Swarm) report the broken deploy as failed, or does CI have to infer it from `/version`?
4. Does an idle SSE stream survive past 60 s with a 25 s keep-alive, and when does one without keep-alive get cut?
5. Does LISTEN recover after a database restart without restarting the app?
6. Anything surprising.
