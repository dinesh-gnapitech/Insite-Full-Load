#Building the Docker Image
From the project root, run:

docker build -f deployment/Dockerfile -t etl-runner:latest .

#Running the Container
Run the container with:

docker run --rm etl-runner:latest