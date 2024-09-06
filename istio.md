# Install Istio on Kind Cluster

This is the sequence of commands which eventually led to success:
```shell
kind create cluster --name istio --config=specs/cluster/cluster.yaml

kubectl get nodes

# Confirm the node name is `istio-control-plane`, otherwise adjust the following command.
kubectl label node istio-control-plane ingress-ready=true

# Deploy Istio
istioctl install -f specs/cluster/install-istio.yaml

# Deploy the k8s-web application
./servicedeploy
```

At this point, the `k8s-web` application is exposed on port 80:
```
http localhost/config
```

and `envoy-proxy` is on port 15021:
```
http localhost:15021/healthz/ready
```

`TO BE CONTINUED`
