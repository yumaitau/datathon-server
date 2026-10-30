#!/usr/bin/env python3
"""End-to-end smoke test of both demo flows against a running, freshly seeded server.

Usage: python3 scripts/smoke.py [base_url]   (default http://localhost:3000)
Exits non-zero on the first failed check.
"""
import gzip
import json
import sys
import urllib.error
import urllib.request
import uuid

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000").rstrip("/")
CODE = "123456"


def call(method, path, body=None, token=None, raw=False, headers=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as res:
            payload = res.read()
            if res.headers.get("content-encoding") == "gzip":
                payload = gzip.decompress(payload)
            out = json.loads(payload)
            return (out, res.headers) if raw else out
    except urllib.error.HTTPError as err:
        detail = err.read().decode()
        raise SystemExit(f"FAIL {method} {path} -> {err.code} {detail}")


def expect_status(method, path, status, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body or {}).encode())
    req.add_header("content-type", "application/json")
    if token:
        req.add_header("authorization", f"Bearer {token}")
    try:
        urllib.request.urlopen(req)
        code = 200
    except urllib.error.HTTPError as err:
        code = err.code
    check(code == status, f"{method} {path} returns {status} (got {code})")


def check(cond, label):
    if not cond:
        raise SystemExit(f"FAIL {label}")
    print(f"ok   {label}")


def login(phone):
    call("POST", "/api/auth/otp/send", {"phoneNumber": phone})
    return call("POST", "/api/auth/otp/verify", {"phoneNumber": phone, "code": CODE})["token"]


def cmid():
    return str(uuid.uuid4())


# ---------- Flow A: Elder runs the community ----------
jordan, grace, leah = login("+61400000003"), login("+61400000001"), login("+61400000004")
me = call("GET", "/api/me", token=grace)
salt = next(m["groupId"] for m in me["memberships"] if m["groupName"] == "Saltbush Creek")
check(salt in me["isElderOf"], "Aunty Grace is an Elder of Saltbush Creek")

m = call("POST", "/api/groups/join", {"joinCode": "salt-2026"}, jordan)
check(m["status"] == "pending", "Jordan's join request is pending")
expect_status("GET", f"/api/groups/{salt}/feed", 404, token=jordan)

mod = call("GET", f"/api/groups/{salt}/moderation", token=grace)
req = next(x for x in mod["memberships"] if x["user"]["name"] == "Jordan Miller")
call("POST", f"/api/memberships/{req['id']}/approve", {}, grace)
expect_status("GET", f"/api/groups/{salt}/moderation", 403, token=jordan)

post_cmid = cmid()
post = call("POST", f"/api/groups/{salt}/posts", {"title": "Footy fundraiser", "body": "Sausage sizzle Saturday", "clientMutationId": post_cmid}, jordan)
check(post["status"] == "published", "Member post publishes without Elder approval")
again = call("POST", f"/api/groups/{salt}/posts", {"title": "Footy fundraiser", "body": "Sausage sizzle Saturday", "clientMutationId": post_cmid}, jordan)
check(again["id"] == post["id"], "Re-submitting the same clientMutationId does not duplicate")
leah_feed = call("GET", f"/api/groups/{salt}/feed", token=leah)
check(any(p["id"] == post["id"] for p in leah_feed["posts"]), "Other members see the new post straight away")

pinned = call("POST", f"/api/posts/{post['id']}/pin", {"pinned": True}, grace)
check(pinned["pinned"], "Elder pins the post")
feed = call("GET", f"/api/groups/{salt}/feed", token=leah)
check(feed["posts"][0]["pinned"], "Pinned posts lead the feed")

c = call("POST", f"/api/posts/{post['id']}/comments", {"body": "Count me in", "clientMutationId": cmid()}, leah)
r = call("POST", f"/api/posts/{post['id']}/comments", {"body": "Me too", "parentCommentId": c["id"], "clientMutationId": cmid()}, jordan)
r2 = call("POST", f"/api/posts/{post['id']}/comments", {"body": "Reply to reply", "parentCommentId": r["id"], "clientMutationId": cmid()}, leah)
check(r2["parentCommentId"] == c["id"], "Threads stay one level deep")
call("POST", f"/api/comments/{r['id']}/report", {"reason": "Testing"}, leah)
mod = call("GET", f"/api/groups/{salt}/moderation", token=grace)
check(any(x["comment"]["id"] == r["id"] for x in mod["reports"]), "Reported comment enters Elder queue")
call("POST", f"/api/comments/{r['id']}/hide", {}, grace)
thread = call("GET", f"/api/posts/{post['id']}/comments", token=leah)
check(all(x["id"] != r["id"] for x in thread[0]["replies"]), "Hidden comment disappears for members")
rx = call("POST", "/api/reactions", {"targetType": "post", "targetId": post["id"], "kind": "heart"}, leah)
check(rx["active"] and rx["counts"]["heart"] == 1, "Reaction toggles on")

dental_req = next(x for x in mod["providerRequests"] if "Dental" in x["provider"]["name"])
call("POST", f"/api/provider-access/{dental_req['id']}/decide", {"decision": "approved"}, grace)
check(not call("GET", f"/api/groups/{salt}/moderation", token=grace)["providerRequests"], "Clinic access approved")

ev = next(e for e in feed["events"] if not e["cancelled"])
rs = call("POST", f"/api/events/{ev['id']}/rsvp", {"response": "going", "clientMutationId": cmid()}, leah)
check(rs["response"] == "going", "RSVP going")

members = call("GET", f"/api/groups/{salt}/members", token=grace)
check(any(m["user"]["name"] == "Jordan Miller" for m in members), "Elder sees the member list")
expect_status("GET", f"/api/groups/{salt}/members", 403, token=leah)

jm = next(m for m in members if m["user"]["name"] == "Jordan Miller")
call("POST", f"/api/memberships/{jm['id']}/custodian", {"canTranslate": True}, grace)
members = call("GET", f"/api/groups/{salt}/members", token=grace)
check(next(m for m in members if m["id"] == jm["id"])["canTranslate"], "Elder appoints a language custodian")
call("POST", f"/api/memberships/{jm['id']}/custodian", {"canTranslate": False}, grace)

# A post an Elder removes reaches its author's offline cache as a removal, not a post.
before = call("POST", "/api/sync", {"mutations": []}, jordan)["cursor"]
junk = call("POST", f"/api/groups/{salt}/posts", {"body": "Selling raffle tickets", "clientMutationId": cmid()}, jordan)
call("POST", f"/api/posts/{junk['id']}/reject", {}, grace)
delta = call("POST", "/api/sync", {"cursor": before, "mutations": []}, jordan)
check(junk["id"] in delta["removedPostIds"] and all(p["id"] != junk["id"] for p in delta["posts"]), "Removed post sent as a removal")
lite = call("POST", "/api/sync/lite", {"cursor": before, "mutations": []}, jordan)
check(junk["id"] in lite["removedPostIds"], "Lite sync carries removals too")

# Community language: published demo language serves web and iOS strings separately.
langs = call("GET", "/api/i18n")
check(any(l["code"] == "qaa" and l["status"] == "published" for l in langs), "Community language is offered")
ios = call("GET", "/api/i18n/qaa?platform=ios")
check(ios["platform"] == "ios" and ios["strings"].get("Community", "").startswith("⟦"), "iOS strings served by source key")
web = call("GET", "/api/i18n/qaa")
check(not any(k.startswith("app:") for k in web["strings"]), "Web pack has no app strings")

# ---------- Flow B: clinic to patient (appointment visibility + offline sync) ----------
appts = call("GET", "/api/appointments", token=leah)
check(len(appts["mine"]) > 0, "Leah sees her appointments")
sam = login("+61400000005")
caring = call("GET", "/api/appointments", token=sam)["caring"]
check(any(a["personName"] == "Leah Thompson" for a in caring), "Sam (carer) sees Leah's appointments")
check(not call("GET", "/api/appointments", token=grace)["caring"], "Elder sees no one else's appointments")

upcoming = next(a for a in appts["mine"] if a["status"] == "booked")
mutation = {"clientMutationId": cmid(), "type": "confirmAppointment", "payload": {"appointmentId": upcoming["id"]}, "createdAt": "2026-10-30T00:00:00.000Z"}
full = call("POST", "/api/sync", {"mutations": [mutation]}, leah)
check(full["results"][0]["status"] == "applied", "Offline confirm applied on reconnect")
dup = call("POST", "/api/sync", {"cursor": full["cursor"], "mutations": [mutation]}, leah)
check(dup["results"][0]["status"] == "duplicate", "Replayed mutation reported as duplicate")
check(next(a for a in dup["appointments"] + full["appointments"] if a["id"] == upcoming["id"])["status"] == "confirmed", "Appointment confirmed")

lite, headers = call("POST", "/api/sync/lite", {"mutations": []}, leah, raw=True, headers={"accept-encoding": "gzip"})
size = int(headers["x-compressed-bytes"])
check(lite["lite"] and size < 5120, f"Lite sync payload under 5 KB ({size} B gzip, {headers['x-payload-bytes']} B raw)")

print("\nAll smoke checks passed.")
