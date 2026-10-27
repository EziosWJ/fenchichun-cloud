package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"fenchichun.local/server/internal/monitoring"
)

func main() {
	socket := flag.String("socket", "/tmp/base-go-host-collector.sock", "local Unix socket path")
	flag.Parse()
	collector, err := monitoring.NewLinuxCollector()
	if err != nil {
		log.Fatal(err)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	log.Printf("host collector listening on %s (5s interval; host namespaces required)", *socket)
	if err := monitoring.ServeUnixCollector(ctx, *socket, collector); err != nil {
		log.Fatal(err)
	}
}
