import subprocess

def handle_def_file_and_create_table(source_path, target_db_config, table_name, logger):
    try:
        # Use the "database" value from target_db_config dynamically instead of "myproj"
        target_db_name = target_db_config.get("database", "myproj")
        command = [
            "python", "tools/myw_db.py", target_db_name, "load", source_path,
            "--update",
            "--host", target_db_config["host"],
            "--port", str(target_db_config["port"]),
            "--username", target_db_config["user"],
            "--password", target_db_config["password"]
        ]
        subprocess.run(command, check=True)
        logger.info(f"✅ Created table '{table_name}' using def file at {source_path}.")
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ Table creation failed for '{table_name}': {e}")
        raise Exception(f"Table creation failed for '{table_name}': {e}")
