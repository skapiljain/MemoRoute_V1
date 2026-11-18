pipeline {
    agent any

    environment {
        NODE_ENV = 'test'
        CI = 'true'
        DOCKER_REGISTRY = 'docker.io'
        DOCKER_IMAGE_API = 'captainkj12/mindecho-api'
        DOCKER_IMAGE_WEB = 'captainkj12/mindecho-web'
        IMAGE_TAG = "${BUILD_NUMBER}"
    }

    tools {
        nodejs 'NodeJS-20'
    }

    stages {
        stage('Checkout Code') {
            steps {
                checkout scm
            }
        }

        stage('Install Dependencies') {
            steps {
                echo 'Installing monorepo dependencies...'
                sh 'npm ci'
                sh 'npm install --os=linux --cpu=x64 @rolldown/binding-linux-x64-gnu --no-save'
            }
        }

        stage('Lint & Typecheck') {
            steps {
                echo 'Running lint and TypeScript typechecks...'
                sh 'npm run lint --workspace=@lector/api'
                sh 'npx tsc --noEmit -p apps/web/tsconfig.json'
            }
        }

        stage('Unit & Integration Tests') {
            steps {
                echo 'Executing Vitest test suite (in-memory MongoDB)...'
                sh 'npm test -- --reporter=default --reporter=junit --outputFile=test-results/junit.xml'
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: '**/test-results/*.xml'
                }
            }
        }

        stage('Build Artifacts') {
            steps {
                echo 'Compiling API and bundling Web...'
                sh 'npm run build:api'
                sh 'npm run build:web'
            }
        }

        stage('Build Docker Images') {
            when {
                anyOf {
                    branch 'develop'
                    branch 'main'
                }
            }
            steps {
                script {
                    echo "Building Docker images with tag ${IMAGE_TAG}..."
                    sh "docker build -f Dockerfile.api -t ${DOCKER_IMAGE_API}:${IMAGE_TAG} -t ${DOCKER_IMAGE_API}:latest ."
                    sh "docker build -f Dockerfile.web -t ${DOCKER_IMAGE_WEB}:${IMAGE_TAG} -t ${DOCKER_IMAGE_WEB}:latest ."
                }
            }
        }

        stage('Push Docker Images') {
            when {
                branch 'develop'
            }
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DOCKER_USER', passwordVariable: 'DOCKER_PASS')]) {
                    sh 'echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin'
                    sh "docker push ${DOCKER_IMAGE_API}:${IMAGE_TAG}"
                    sh "docker push ${DOCKER_IMAGE_API}:latest"
                    sh "docker push ${DOCKER_IMAGE_WEB}:${IMAGE_TAG}"
                    sh "docker push ${DOCKER_IMAGE_WEB}:latest"
                }
            }
        }

        stage('Deploy to Kubernetes') {
            when {
                branch 'main'
            }
            steps {
                echo 'Applying Kubernetes manifests...'
                sh 'kubectl apply -f k8s/namespace.yaml'
                sh 'kubectl apply -f k8s/configmap.yaml'
                sh "kubectl set image deployment/mindecho-api api=${DOCKER_IMAGE_API}:${IMAGE_TAG} -n mindecho"
                sh "kubectl set image deployment/mindecho-web web=${DOCKER_IMAGE_WEB}:${IMAGE_TAG} -n mindecho"
                sh 'kubectl apply -f k8s/ingress.yaml'
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo 'MindEcho CI/CD Pipeline succeeded!'
        }
        failure {
            echo 'Pipeline failed. Check build console logs.'
        }
    }
}
