import json
import sys
from jsonschema import validate, ValidationError

def validate_submission(submission_path):
    # Load the schema
    schema = {
        "type": "object",
        "required": ["name", "description", "version", "author", "license", "repository", "endpoints"],
        "properties": {
            "name": {"type": "string"},
            "description": {"type": "string"},
            "version": {"type": "string"},
            "author": {"type": "string"},
            "license": {"type": "string"},
            "repository": {"type": "string"},
            "endpoints": {
                "type": "object",
                "required": ["initialize"],
                "properties": {
                    "initialize": {"type": "string"}
                }
            }
        }
    }

    try:
        # Load the submission file
        with open(submission_path, 'r') as f:
            submission = json.load(f)
        
        # Validate against schema
        validate(instance=submission, schema=schema)
        print("✅ Submission is valid!")
        return True
    except ValidationError as e:
        print(f"❌ Validation error: {e.message}")
        return False
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON: {e}")
        return False
    except FileNotFoundError:
        print(f"❌ File not found: {submission_path}")
        return False

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python submission_validator.py <submission_file_path>")
        sys.exit(1)
    
    submission_path = sys.argv[1]
    success = validate_submission(submission_path)
    sys.exit(0 if success else 1) 