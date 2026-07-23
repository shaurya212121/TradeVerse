import zmq
import sys

def run_chat_client():
    context = zmq.Context()

    chat_socket = context.socket(zmq.REQ)
    chat_socket.connect("tcp://127.0.0.1:5556")

    print("💬 TradeVerse Command Terminal — Connected on Port 5556.")
    print("Commands: 'STATUS_CHECK', 'MANUAL_OVERRIDE', 'PORTFOLIO', 'HISTORY', or any text.")
    print("-" * 65)

    try:
        while True:
            user_command = input("Command > ").strip()

            if not user_command:
                continue

            if user_command.lower() == 'exit':
                print("Closing command terminal.")
                break

            chat_socket.send_string(user_command)
            reply = chat_socket.recv_string()
            print(f"📡 [Server Response]:\n{reply}\n")

    except KeyboardInterrupt:
        print("\nExiting command terminal.")
    finally:
        chat_socket.close()
        context.term()

if __name__ == "__main__":
    run_chat_client()