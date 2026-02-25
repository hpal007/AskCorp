# Fucntion url
Auth type: NONE

## CORS 
allow-header: content-type
allow-method: POST
allow-origin: <static-s3-url>


# Role update in IAM for permission to access resources 
update the role which was creating by lambda function and attach the policy 
example: AmazonBedrockFullAccess