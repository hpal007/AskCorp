"""
AWS Lambda function for Amazon Bedrock model invocation.
Uses langchain-aws (ChatBedrockConverse) for Claude, Llama, Titan, and Gemma.
CORS is handled by Lambda Function URL config — not in code.
"""

import json
import logging
import os

from botocore.exceptions import ClientError
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage

# ---- Logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ---- Config
MOCK_MODE = False
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

# ---- LangChain-AWS invocation

def invoke_bedrock_model(
    model_id: str,
    prompt: str,
    system_prompt: str | None = None,
    max_tokens: int = 2048,
    temperature: float = 0.7,
) -> str:
    """Invoke a Bedrock model via LangChain ChatBedrockConverse."""
    llm = ChatBedrockConverse(
        model=model_id,
        region_name=AWS_REGION,
        max_tokens=max_tokens,
        temperature=temperature,
    )

    messages = []
    if system_prompt:
        messages.append(SystemMessage(content=system_prompt))
    messages.append(HumanMessage(content=prompt))

    logger.info("Invoking model %s | max_tokens=%d | temperature=%.2f", model_id, max_tokens, temperature)
    logger.info("Using Bedrock Converse API to generate response")

    response = llm.invoke(messages)

    content = response.content
    if isinstance(content, list):
        return "".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        )
    return str(content)


def mock_invoke_model(model_id: str, prompt: str) -> str:
    """Mock model invocation for local testing."""
    return f"[MOCK {model_id.upper()}] Response to: {prompt[:50]}..."


# ---- Lambda handler

def lambda_handler(event: dict, context) -> dict:
    """AWS Lambda entry-point. CORS is handled by Lambda Function URL config."""

    logger.info("Incoming event: %s", json.dumps(event))

    try:
        # ---- Parse body ----
        if isinstance(event.get("body"), str):
            body = json.loads(event["body"])
        else:
            body = event.get("body") or event

        # ---- Extract parameters ----
        model_id      = body.get("model", "google.gemma-3-12b-it")
        prompt        = body.get("query")
        
        system_prompt = "You are helpful assistant, who helps with Q&A for Policy related documents. "
        max_tokens    = 2048
        temperature   = 0.7
        # top_k = 3

        if not prompt:
            return {
                "statusCode": 400,
                "body": json.dumps({"error": "prompt (query) is required"}),
            }

        logger.info("Model: %s | Prompt length: %d", model_id, len(prompt))

        # ---- Invoke ----
        if MOCK_MODE:
            generated_text = mock_invoke_model(model_id, prompt)
        else:
            generated_text = invoke_bedrock_model(
                model_id, prompt, system_prompt, max_tokens, temperature
            )

        return {
            "statusCode": 200,
            "body": json.dumps({
                "response":     generated_text,
                "model_id":     model_id,
            }),
        }

    except ValueError as e:
        logger.error("Validation error: %s", e)
        return {
            "statusCode": 400,
            "body": json.dumps({"error": str(e)}),
        }

    except ClientError as e:
        logger.error("AWS ClientError: %s", e)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "AWS service error", "message": str(e)}),
        }

    except Exception as e:
        logger.error("Unexpected error: %s", e, exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": "Internal server error", "details": str(e)}),
        }
    