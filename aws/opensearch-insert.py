import boto3
import json
from pathlib import Path
from datetime import datetime, timezone
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth
from opensearchpy.helpers import bulk

CACHE_FILE = Path.home() / ".aws" / "mfa_session_cache.json"

def get_opensearch_client(host, region="us-east-1", profile="impetus"):
    # Load cache if valid
    if CACHE_FILE.exists():
        cached = json.loads(CACHE_FILE.read_text())
        if datetime.now(timezone.utc) < datetime.fromisoformat(cached["Expiration"]):
            creds = cached
        else:
            creds = None
    else:
        creds = None

    # Refresh if no valid cache
    if not creds:
        base = boto3.Session(profile_name=profile)
        sts = base.client("sts")
        iam = base.client("iam")
        username = sts.get_caller_identity()["Arn"].split("/")[-1]
        mfa_arn = iam.list_mfa_devices(UserName=username)["MFADevices"][0]["SerialNumber"]
        mfa_code = input(f"Enter MFA code for {username}: ").strip()
        creds = sts.get_session_token(SerialNumber=mfa_arn, TokenCode=mfa_code, DurationSeconds=43200)["Credentials"]
        creds["Expiration"] = creds["Expiration"].isoformat()
        CACHE_FILE.write_text(json.dumps(creds))

    auth = AWS4Auth(creds["AccessKeyId"], creds["SecretAccessKey"], region, "aoss", session_token=creds["SessionToken"])
    return OpenSearch(hosts=[{"host": host, "port": 443}], http_auth=auth, use_ssl=True, verify_certs=True, connection_class=RequestsHttpConnection, timeout=300)


# Usage


client = get_opensearch_client("9qphx96mrk5mf3hriwx1.us-east-1.aoss.amazonaws.com")
INDEX = "model-laws-index"
CHUNK_FILE = "../docs/model_law/model-law-565_chunks.json"

# print(client.search(index="model-laws-index", body={"query": {"match_all": {}}}))

# delete 
# Delete all docs one by one (slow but works)
results = client.search(index="model-laws-index", body={"query": {"match_all": {}}}, size=100)
for hit in results["hits"]["hits"]:
    client.delete(index="model-laws-index", id=hit["_id"])

# print("Index cleared")

with open(CHUNK_FILE) as f:
    chunks = json.load(f)

print(f"Loaded {len(chunks)} chunks")

def generate_actions():
    for chunk in chunks:
        metadata = chunk["metadata"]

        yield {
            "_op_type": "index",
            "_index": INDEX,
            "_source": {
                "id": metadata["id"],
                "text": chunk["text"],
                "document": metadata["document"],
                "path": metadata["path"],
                "section": metadata["section"],
                "type": metadata["type"]
            }
        }

print("Uploading documents...")

try:
    success, failed = bulk(client, generate_actions(), raise_on_error=False)
    print("Indexed:", success)
    print("Failed:", failed)

except Exception as e:
    print("Bulk error:", e)


print("Indexed:", success)
print("Failed:", failed)

print(
    client.search(
        index=INDEX,
        body={
            "size": 5,
            "query": {"match_all": {}}
        }
    )
)