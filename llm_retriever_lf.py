"""
AWS Lambda function - for retrieving and generating answers from Bedrock Knowledge Base using a specified foundation model.
"""

import json
import boto3

# ---- CONFIG ----
KNOWLEDGE_BASE_ID = "M0HJWPOHQE"
REGION = "us-east-1"
MODEL_ARN = (
    "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0"
)
# ----------------

# Initialize client once at the top
bedrock_agent = boto3.client("bedrock-agent-runtime", region_name=REGION)

s3 = boto3.client("s3")


def lambda_handler(event, context):
    # Handle CORS preflight request
    if event.get("httpMethod") == "OPTIONS":
        return cors_response(200, {})

    try:
        # Parse the question from request body
        body = json.loads(event.get("body", "{}"))
        question = body.get("question", "").strip()

        if not question:
            return cors_response(400, {"error": "Question is required"})

        # Call Bedrock Knowledge Base
        response = bedrock_agent.retrieve_and_generate(
            input={"text": question},
            retrieveAndGenerateConfiguration={
                "type": "KNOWLEDGE_BASE",
                "knowledgeBaseConfiguration": {
                    "knowledgeBaseId": KNOWLEDGE_BASE_ID,
                    "modelArn": MODEL_ARN,
                    "retrievalConfiguration": {
                        "vectorSearchConfiguration": {"numberOfResults": 3}
                    },
                },
            },
        )

        answer = response["output"]["text"]

        # Extract source citations
        citations = []

        for citation in response.get("citations", []):
            for ref in citation.get("retrievedReferences", []):
                location = ref.get("location", {})
                metadata = ref.get("metadata", {})

                s3_uri = None
                presigned_url = None
                source_file = None

                if location.get("type") == "S3":
                    s3_uri = location.get("s3Location", {}).get("uri")

                    if s3_uri:
                        path = s3_uri.replace("s3://", "")
                        bucket, key = path.split("/", 1)

                        source_file = key.split("/")[-1]

                        presigned_url = s3.generate_presigned_url(
                            "get_object",
                            Params={"Bucket": bucket, "Key": key},
                            ExpiresIn=3600,
                        )

                citations.append(
                    {
                        "source_file": source_file,
                        "page_number": metadata.get("page_number"),
                        "s3_uri": presigned_url,
                    }
                )

        return cors_response(200, {"answer": answer, "citations": citations})

    except Exception as e:
        print(f"Error: {str(e)}")
        return cors_response(500, {"error": str(e)})


def cors_response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        "body": json.dumps(body),
    }
