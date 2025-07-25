#!/bin/bash

# 打直播包本地脚本
# 基于原GitHub Action转换而来

set -e  # 遇到错误立即退出

# 颜色输出函数
print_info() {
    echo -e "\033[34m[INFO]\033[0m $1"
}

print_success() {
    echo -e "\033[32m[SUCCESS]\033[0m $1"
}

print_error() {
    echo -e "\033[31m[ERROR]\033[0m $1"
}

# 检查必要的工具
check_dependencies() {
    print_info "检查必要的工具..."

    # 检查Node.js和npm
    if ! command -v node &> /dev/null; then
        print_error "Node.js 未安装，请先安装 Node.js"
        exit 1
    fi

    if ! command -v npm &> /dev/null; then
        print_error "npm 未安装，请先安装 npm"
        exit 1
    fi

    # 检查unzip
    if ! command -v unzip &> /dev/null; then
        print_error "unzip 未安装，请先安装 unzip"
        exit 1
    fi

    # 检查wget或curl
    if ! command -v wget &> /dev/null && ! command -v curl &> /dev/null; then
        print_error "wget 或 curl 未安装，请先安装其中一个"
        exit 1
    fi

    print_success "依赖检查通过"
}

# 获取当前分支名
get_current_branch() {
    if [ -d ".git" ]; then
        git rev-parse --abbrev-ref HEAD
    else
        echo "main"
    fi
}

# 获取当前commit的短SHA
get_short_sha() {
    if [ -d ".git" ]; then
        git rev-parse --short HEAD
    else
        echo "unknown"
    fi
}

# 主函数
main() {
    print_info "开始构建直播包..."

    # 检查依赖
    check_dependencies

    # 获取当前日期和分支信息
    current_date=$(date +'%Y-%m-%d')
    current_branch=$(get_current_branch)
    short_sha=$(get_short_sha)

    print_info "当前日期: $current_date"
    print_info "当前分支: $current_branch"
    print_info "当前SHA: $short_sha"

    # 创建临时目录
    temp_dir="/tmp/target"
    print_info "创建临时目录: $temp_dir"
    rm -rf "$temp_dir"
    mkdir -p "$temp_dir/static"

    # 安装Sass编译器
    print_info "安装 Sass 编译器..."
    npm install -g sass

    # 编译SCSS/Sass文件到CSS
    print_info "编译 SCSS/Sass 文件到 CSS..."
    find . -name "*.scss" -o -name "*.sass" | while read -r file; do
        if [[ "$file" == *.scss ]]; then
            # 编译 .scss 文件
            output_file="${file%.scss}.css"
            echo "编译 $file 到 $output_file"
            sass "$file" "$output_file" -s compressed --no-source-map
            # 删除原始 .scss 文件
            rm "$file"
            echo "已删除原始文件: $file"
        elif [[ "$file" == *.sass ]]; then
            # 编译 .sass 文件
            output_file="${file%.sass}.css"
            echo "编译 $file 到 $output_file"
            sass "$file" "$output_file" -s compressed --no-source-map
            # 删除原始 .sass 文件
            rm "$file"
            echo "已删除原始文件: $file"
        fi
    done

    # 将代码复制到target/static（排除.git目录）
    print_info "复制代码到 target/static..."
    cp -af ./ "$temp_dir/static/clan2025"
    rm -rf "$temp_dir/static/clan2025/.git"

    # 下载tosu release
    print_info "下载 tosu release..."
    tosu_zip="$temp_dir/tosu.zip"
    if command -v wget &> /dev/null; then
        wget -O "$tosu_zip" "https://github.com/tosuapp/tosu/releases/download/v4.9.0/tosu-windows-v4.9.0.zip"
    else
        curl -L -o "$tosu_zip" "https://github.com/tosuapp/tosu/releases/download/v4.9.0/tosu-windows-v4.9.0.zip"
    fi

    # 解压tosu
    print_info "解压 tosu..."
    unzip "$tosu_zip" -d "$temp_dir/"
    rm "$tosu_zip"

    # 写入tosu配置
    print_info "写入 tosu 配置..."
    echo "ENABLE_AUTOUPDATE=false" > "$temp_dir/tsosu.env"
    echo "STATIC_FOLDER_PATH=./static" >> "$temp_dir/tsosu.env"

    # 创建最终的压缩包
    output_filename="CLAN2025-stream-overlay_${current_date}_${current_branch}_${short_sha}.zip"
    output_path="$(pwd)/$output_filename"

    print_info "创建压缩包: $output_filename"
    cd "$temp_dir"

    # 使用最高压缩级别创建zip文件
    if command -v zip &> /dev/null; then
        zip -r -9 "$output_path" ./*
    else
        # 如果没有zip命令，尝试使用7z
        if command -v 7z &> /dev/null; then
            7z a -mx9 "$output_path" ./*
        else
            print_error "需要安装 zip 或 7z 命令来创建压缩包"
            exit 1
        fi
    fi

    # 清理临时目录
    print_info "清理临时文件..."
    rm -rf "$temp_dir"

    print_success "构建完成！"
    print_success "输出文件: $output_path"
    print_success "文件大小: $(du -h "$output_path" | cut -f1)"
}

# 显示帮助信息
show_help() {
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -h, --help     显示帮助信息"
    echo "  -v, --version  显示版本信息"
    echo ""
    echo "这个脚本会:"
    echo "1. 编译所有 SCSS/Sass 文件为 CSS"
    echo "2. 下载 tosu 应用程序"
    echo "3. 打包所有文件为一个压缩包"
    echo ""
    echo "依赖要求:"
    echo "- Node.js 和 npm"
    echo "- unzip"
    echo "- wget 或 curl"
    echo "- zip 或 7z"
}

# 处理命令行参数
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    -v|--version)
        echo "打直播包脚本 v1.0.0"
        exit 0
        ;;
    "")
        main
        ;;
    *)
        print_error "未知选项: $1"
        show_help
        exit 1
        ;;
esac