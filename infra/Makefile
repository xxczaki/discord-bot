TERRAFORM_DIR := terraform

.PHONY: init plan apply destroy kubeconfig deploy-image

init:
	cd $(TERRAFORM_DIR) && terraform init

plan:
	cd $(TERRAFORM_DIR) && terraform plan

apply:
	cd $(TERRAFORM_DIR) && terraform apply

destroy:
	cd $(TERRAFORM_DIR) && terraform destroy

kubeconfig:
	cd $(TERRAFORM_DIR) && terraform output -raw kubeconfig > ../kubeconfig.yaml
	@echo "Written to kubeconfig.yaml"

deploy-image:
	@test -n "$(TAG)" || (echo "Usage: make deploy-image TAG=<commit-sha>" && exit 1)
	cd $(TERRAFORM_DIR) && terraform apply -var="image_tag=$(TAG)"
