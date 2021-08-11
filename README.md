# Simple Web Application -- k8s-webserver

![Version](https://img.shields.io/badge/Version-0.6.1-blue)
![Released](https://img.shields.io/badge/Released-2020.11.27-green)

[![Author](https://img.shields.io/badge/Author-M.%20Massenzio-green)](https://bitbucket.org/marco)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
![OS Debian](https://img.shields.io/badge/OS-Linux-green)


A simple two-tier web app, using [Flask](https://flask.io) and [MongoDB](https://mongodb.com)
to experiment and learn [Kubernetes](https://kubernetes.io) capabilities.

# GitOps Model

This is the ["deployment"](https://bitbucket.org/marco/k8s-web-config) project contains all the necessary automation to deploy the service on a Kubernetes cluster

The "development" part of the services, which contains the code for the application, and whose generated artifact(s) are the Docker containers can be found [here](https://bitbucket.org/marco/k8s-web).


# 2-tier Service in Kubernetes

## Deployment

The full deployment of the cluster is done simply executing:

    $ ./servicedeploy [NAMESPACE]

with `NAMESPACE` an optional Kubernetes `namespace` to deploy the app into.

See [Utilities](#utilities) for instructions as to how to inspect the deployed service.

To remove all the services and clean up, use the `--remove` flag (remember to specify the `namespace` if one was specified during deployment):

    $ ./servicedeploy --remove [NAMESPACE]

The `NAMESPACE` will **not** be removed, even if empty; you will need to do that manually:

    $ kubectl delete ns NAMESPACE


## Backing DB (MongoDB 3.7.9)

The cluster is deployed as a 3-node `StatefulSet`, with each node having respectively data stored persistently on a `PersistentVolumeClaim`; the definition is in `specs/backend.yaml` and uses a "Headless Service" (called `mongo-cluster`) which fronts all the nodes (each named `mongo-node`).

The MongoDB cluster is reachable at the following URI:

    mongodb://mongo-node-0.mongo-cluster,mongo-node-1.mongo-cluster,mongo-node-2.mongo-cluster:27017

(see also the `ConfigMap` defined in `frontend.yaml`).

The [ReplicaSet](https://docs.mongodb.com/manual/replication/) (**not** a Kubernetes `ReplicaSet`) is defined by running a Kubernetes `Job` pod, defined in `replicas-job.yaml`, which must be executed once the first MongoDB node (`mongo-node-0`) is ready to receive commands via the `mongo` shell.


## Frontend (Web) Service (Python Flask server)

The front-end Web tier (load-balanced via the `frontend` Service) is created via a `Deployment` composed of `replicas` nodes (currently, 3), defined in `frontend.yaml`.

Inside the Kubernetes cluster, the service is available at the `http://frontend` URL; and is exposed externally via a `NodePort` service on port `32100` of the Node's IP:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend

spec:
  type: NodePort
  ports:
  - name: http
    port: 80
    nodePort: 32100
  selector:
    app: webapp
```

To discover the URL to reach from the local development machine if using `minikube`, use:

    minikube service list

    |-------------|---------------|--------------|----------------------------|
    |  NAMESPACE  |     NAME      | TARGET PORT  |            URL             |
    |-------------|---------------|--------------|----------------------------|
    | default     | frontend      | http/80      | http://192.168.5.130:32100 |


## Service Configuration

The `frontend.yaml` configuration contains the definition of a
[ConfigMap](https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/):


```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: frontend-config

data:
  config.yaml: |
    # Used as ConfigMap to run the server in k8s.
    server:
      workdir: /var/lib/flask

    db:
      # Here the 'hostname' must match the Service `name`
      # fronting the backend (see backend-service.yaml)
      uri: "mongodb://backend:27017/my-db"
      collection: "sampledata"
```

which is then used to configure the Web server, by first defining a `Volume`:

```yaml
      volumes:
      - name: config
        configMap:
          name: frontend-config
```

and then mounting it on the container:

```yaml
  spec:
    containers:
    - image: massenz/simple-flask:0.6.1
      ...
      volumeMounts:
      - name: config
        mountPath: "/etc/flask"
        readOnly: true
```

which creates a file in the container at `/etc/flask/config.yaml`.

This is the location specified in the frontend container Dockerfile to use, via the `${CONFIG}` env var, which we also specify in the frontend spec:

```yaml
      env:
        - name: CONFIG
          value: "/etc/flask/config.yaml"
```

# Utilities

## Kubernetes Dashboard

To run the [K8s Dashboard](https://kubernetes.io/docs/tasks/access-application-cluster/web-ui-dashboard/) locally, it requires some security configurations; detailed instructions [here](https://github.com/kubernetes/dashboard/blob/master/docs/user/access-control/creating-sample-user.md):

```shell
$ kubectl create ns kubernetes-dashboard
$ kubectl apply -f admin.yaml
$ kubectl apply -f admin-binding.yaml
$ kubectl -n kubernetes-dashboard describe secret \
      $(kubectl -n kubernetes-dashboard get secret | \
        grep admin-user | awk '{print $1}')
```

More details on [Kubernetes Authentication](https://kubernetes.io/docs/reference/access-authn-authz/authentication/).

If using [Minikube](https://minikube.sigs.k8s.io/docs/) use:

    minikube dashboard


## Utility pod

There is also a `utils` Pod to have access to a few utilities (`curl`, `nslookup`, etc.) from within the cluster defined in `utils.yaml` (see [the Container](https://hub.docker.com/repository/docker/massenz/dnsutils) and [the Dockerfile definition](https://bitbucket.org/marco/dnsutils)).


In particular, [`httpie`](https://httpie.org/docs) is quite useful to probe around the API:

```bash
$ kubectl exec -it utils -- http frontend/config

{
    "application_root": "/",
    "db_collection": "sampledata",
    "db_uri": "mongodb://backend:27017/my-db",
    "debug": false,
    "env": "production",
    "explain_template_loading": false,
    "health": "UP",
    ...
}

$ kubectl exec -it utils -- http frontend/api/v1/entity name=Marco job=Architect company=Adobe

HTTP/1.0 201 CREATED
Content-Length: 19
Content-Type: application/json
Date: Mon, 07 Sep 2020 07:26:30 GMT
Location: http://frontend/api/v1/entity/5f55e0a6baa67e0325d2cd9d
Server: Werkzeug/1.0.1 Python/3.7.9

{
    "msg": "inserted"
}

$ kubectl exec -it utils -- http frontend/api/v1/entity/5f55e0a6baa67e0325d2cd9d
HTTP/1.0 200 OK
Content-Length: 85
Content-Type: application/json
Date: Mon, 07 Sep 2020 07:27:16 GMT
Server: Werkzeug/1.0.1 Python/3.7.9

{
    "company": "Adobe",
    "id": "5f55e0a6baa67e0325d2cd9d",
    "job": "Architect",
    "name": "Marco"
}
```


# Ingress Controller

`TODO(marco): This is currently NOT working.`

Deployed in the manner described above, the service is unreachable from outside the Kubernetes cluster; in order to make it reachable, we deploy an [NGNIX Ingress Controller](https://kubernetes.github.io/ingress-nginx/).

**NOTE**
> The following is based on the [Kubernetes tutorial on Ingress Controller](https://kubernetes.io/docs/tasks/access-application-cluster/ingress-minikube/#enable-the-ingress-controller).

The first step is to actually deploy the Controller:

```bash
minikube addons enable ingress

kubectl get pods -n kube-system

  ...
  nginx-ingress-controller-5984b97644-rnkrg   1/1       Running ...

kubectl expose deployment frontend-cluster --port 80 --target-port 8080 \
    --type NodePort --name kmaps
```

A new `NodePort` service is now available:

```bash
kubectl get service kmaps

kmaps
NAME    TYPE       CLUSTER-IP      EXTERNAL-IP   PORT(S)        AGE
kmaps   NodePort   10.105.74.231   <none>        80:31787/TCP   81s
```

this is reachable from inside the cluster as the `kmaps` service on port 80:

```bash
kubectl exec -ti utils -- curl -fs http://kmaps

  <!DOCTYPE html>
  <html xmlns="http://www.w3.org/1999/html">
  <head
    ...
  </html>
```

(which is not particularly useful) but, more interestingly from outside the cluster too:

```bash
minikube service kmaps
```

will open a browser window on the main app page, reachable at `http://192.168.8.130:31787` (use `minikube service list` to find the IP/Port for the service).

## NGNIX Web configuration

The real point of adding an Ingress controller is however to somehow add behavior to the incoming requests; in the example in `configs/ingress.yaml` this is to add multiple "virtual hosts" to this cluster:

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
...
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$1
...
      paths:
      - path: /kmaps/?(.*)
        backend:
          serviceName: kmaps
          servicePort: 80
      - path: /kmaps/v2/?(.*)
        backend:
          serviceName: kmaps-v2
          servicePort: 80
```

**NOTE**
> The `rewrite` annotation is described [here](https://kubernetes.github.io/ingress-nginx/examples/rewrite/) and is required, so that application URLs can be mapped back to what the Web application expects.

Deploy the `ingress.yaml` spec:

```
$ kubectl apply -f configs/ingress.yaml
```

and (optionally) modify `/etc/hosts` so that `frontend.info` points to the `minikube ip`; then the Flask frontend will be reachable at: `http://frontend.info/kmaps/`.

**NOTE**
> This is only to emulate a DNS service that would map the cluster/service domain - it is entirely irrelevant for the purposes of the example here.
