import json

def load_config(file_path):
    try:
        with open(file_path, 'r') as f:
            config = json.load(f)
        return config
    except Exception as e:
        raise Exception(f"Error loading configuration file '{file_path}': {e}")
