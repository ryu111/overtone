## GUT 命令列執行入口（stub）
##
## ⚠️ 這是 stub 版本。完整版請從官方 repo 下載：https://github.com/bitwes/Gut
##
## 完整版的執行方式：
##   godot --headless --path . -s addons/gut/gut_cmdln.gd \
##     -gdir=res://tests/ -gexit

extends SceneTree

func _init() -> void:
	print("[GUT Stub] 請安裝完整版 GUT 才能執行測試。")
	print("下載地址：https://github.com/bitwes/Gut/releases")
	quit(1)
