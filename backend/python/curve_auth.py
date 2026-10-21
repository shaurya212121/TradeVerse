import zmq

SERVER_PUB = b".OVlZOQ!o(TwV&50-2g#W:Rg/z5p9n!GxY{9LisH"
CLIENT_PUB = b"fLG9t-+%NRkyH4Y+)<gjn}-$F{?PjPT3hLmp/bEy"
CLIENT_SEC = b"!eProFs0h9rqmdglyb@YpY^?M[Gah2Ws4.X(FZ+?"

def setup_curve_client(socket: zmq.Socket):
    """Configures CurveZMQ 25519 encryption and ZAP client authentication on a ZeroMQ socket."""
    socket.curve_serverkey = SERVER_PUB
    socket.curve_publickey = CLIENT_PUB
    socket.curve_secretkey = CLIENT_SEC
    return socket
