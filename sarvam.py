import json
import sys
import urllib.request
import urllib.error

# --- Sarvam Workspace Credentials (Hardcoded from fuckoff.py) ---
ORG_ID = "019ecf64-7792-786f-88bf-4a6af1434e36"
WORKSPACE_ID = "019ecf64-779b-7b9c-a7b8-c8f9ac9003c5"
API_KEY = "sk_samvaad_zqqofijh_Ihknj9mcWaSsgh1hmyPUBwWV"

# --- Agent Configuration ---
APP_ID = "Conversatio-a0f6e88a-8ae1"
APP_VERSION = 2
CONNECTION_ID = "fa4c85d2-05-f6baf366-1cf6"
AGENT_PHONE_NUMBER = "+918071583844"

# --- Target Phone Number ---
USER_PHONE_NUMBER = "+918446163990"

def trigger_sarvam_outbound_call(user_phone="+918446163990", hospital_name="Aivana Hospital"):
    url = f"https://apps.sarvam.ai/api/outbounds/v1/orgs/{ORG_ID}/workspaces/{WORKSPACE_ID}/outbounds"

    payload = {
        "app_config": {
            "app_id": APP_ID,
            "app_version": APP_VERSION,
            "connection_config": {
                "connection_id": CONNECTION_ID,
                "agent_phone_number": AGENT_PHONE_NUMBER,
            },
            "agent_variables": {
                "hospital_name": hospital_name
            },
        },
        "user_config": {
            "user_phone_number": user_phone,
        },
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-API-Key": API_KEY,
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            res_body = response.read().decode("utf-8")
            return response.status, json.loads(res_body)
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")
        try:
            return e.code, json.loads(error_body)
        except Exception:
            return e.code, {"error": error_body}
    except Exception as e:
        return 500, {"error": str(e)}

if __name__ == "__main__":
    target_phone = sys.argv[1] if len(sys.argv) > 1 else USER_PHONE_NUMBER
    status_code, result = trigger_sarvam_outbound_call(target_phone)
    print(f"HTTP Status: {status_code}")
    print(json.dumps(result, indent=2))
